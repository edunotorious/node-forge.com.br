"""Graph → Python (Qiskit) codegen.

Reads the same `graph_json` shape the editor persists and emits an
executable script: QuantumCircuit setup, gates in topological order,
optional Aer simulator run + histogram plot.

Design notes
------------
* Edges encode execution order, not qubit wires. `qubit_index` (and the
  CNOT pair, measurement classical index, etc.) lives in each node's
  `data` payload.
* Nodes without incoming or outgoing edges are still emitted — a circuit
  with one Hadamard and no edges is valid Python; it just won't measure.
* A cycle in the graph is a user error; we raise `GraphCycleError` so the
  route layer can return a 400. There's no recovery — the topo sort would
  silently drop nodes otherwise.
* The Run / Plot Histogram nodes are special: they are the only ones that
  read the result of execution. Code is emitted such that `_counts` is
  available iff a Run-Simulator node is present.
"""

from __future__ import annotations

from collections import deque
from typing import Any


class GraphCycleError(ValueError):
    """The graph has a directed cycle — execution order is undefined."""


# Mirror of `NODE_TYPES` in frontend/src/lib/graph-types.ts. Kept in sync by
# convention; a future shared schema would lift this out of both repos.
NODE_HADAMARD = "qiskit.hadamard"
NODE_PAULI_X = "qiskit.pauli_x"
NODE_PAULI_Y = "qiskit.pauli_y"
NODE_PAULI_Z = "qiskit.pauli_z"
NODE_CNOT = "qiskit.cnot"
NODE_MEASURE = "qiskit.measure"
NODE_BARRIER = "qiskit.barrier"
NODE_RUN_SIM = "qiskit.run_local_simulator"
NODE_PLOT_HIST = "qiskit.plot_histogram"

_SINGLE_QUBIT_GATE = {
    NODE_HADAMARD: "h",
    NODE_PAULI_X: "x",
    NODE_PAULI_Y: "y",
    NODE_PAULI_Z: "z",
}

# Maps the frontend's variable-type tag (see lib/graph-types.ts:VARIABLE_TYPES)
# to a Python type expression usable in an annotation. None is kept as a
# string for return-type emission.
_PY_TYPE = {
    "Int": "int",
    "Float": "float",
    "Str": "str",
    "Bool": "bool",
    "List": "list",
    "Dict": "dict",
    "None": "None",
}

# Default Python literal for each type when the user did not supply a value.
# Mirrors what `0` / `""` / `False` would naturally be for the type.
_DEFAULT_LITERAL = {
    "Int": "0",
    "Float": "0.0",
    "Str": '""',
    "Bool": "False",
    "List": "[]",
    "Dict": "{}",
}


def _topo_sort(
    nodes: list[dict[str, Any]], edges: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Kahn's algorithm. Returns nodes in a valid execution order.
    Disconnected nodes appear at the end (no incoming edges, no outgoing).
    """
    node_by_id: dict[str, dict[str, Any]] = {}
    for n in nodes:
        nid = n.get("id")
        if isinstance(nid, str):
            node_by_id[nid] = n

    in_degree: dict[str, int] = {nid: 0 for nid in node_by_id}
    adjacency: dict[str, list[str]] = {nid: [] for nid in node_by_id}

    for e in edges:
        src = e.get("source")
        tgt = e.get("target")
        if not isinstance(src, str) or not isinstance(tgt, str):
            continue
        if src not in node_by_id or tgt not in node_by_id:
            continue
        adjacency[src].append(tgt)
        in_degree[tgt] = in_degree.get(tgt, 0) + 1

    queue: deque[str] = deque(nid for nid, d in in_degree.items() if d == 0)
    sorted_ids: list[str] = []
    while queue:
        nid = queue.popleft()
        sorted_ids.append(nid)
        for next_id in adjacency[nid]:
            in_degree[next_id] -= 1
            if in_degree[next_id] == 0:
                queue.append(next_id)

    if len(sorted_ids) != len(node_by_id):
        raise GraphCycleError("Graph has a cycle; cannot determine execution order")

    return [node_by_id[i] for i in sorted_ids]


def _emit_variable(v: dict[str, Any]) -> list[str]:
    """One `name: type = value` line per user-defined variable. We trust
    the value field verbatim — it's whatever the user typed in the dialog
    — and rely on the executor sandbox as the safety net. Bad values
    surface as Python SyntaxError / NameError at run time, which lands in
    `stderr` and reaches the Console tab cleanly."""
    name = (v.get("name") or "").strip()
    if not name:
        return []
    type_name = v.get("type", "Int")
    py_type = _PY_TYPE.get(type_name, "object")
    raw_value = (v.get("value") or "").strip()
    if not raw_value:
        raw_value = _DEFAULT_LITERAL.get(type_name, "None")
    return [f"{name}: {py_type} = {raw_value}"]


def _emit_method(f: dict[str, Any]) -> list[str]:
    """Like _emit_function but the first parameter is implicitly `self`.
    Body is indented two levels (we're inside the class block already)."""
    name = (f.get("name") or "").strip()
    if not name:
        return []
    return_type = f.get("return_type", "None")
    py_return = _PY_TYPE.get(return_type, "None")

    params = f.get("parameters") or []
    params_parts = ["self"]
    for p in params:
        pname = (p.get("name") or "").strip()
        if not pname:
            continue
        ptype = _PY_TYPE.get(p.get("type", "Int"), "object")
        params_parts.append(f"{pname}: {ptype}")
    params_str = ", ".join(params_parts)

    body = f.get("body") or ""
    body_lines = [ln for ln in body.splitlines() if ln.strip() != ""]
    if not body_lines:
        body_lines = ["pass"]
    return [
        f"def {name}({params_str}) -> {py_return}:",
        *[f"    {line}" for line in body_lines],
    ]


def _emit_class(c: dict[str, Any]) -> list[str]:
    """Emit a `class Name(Parent): ...` block with decorators above. Members
    follow the Python convention order: class vars → methods. An empty
    class with no members gets a `pass` so the def parses."""
    name = (c.get("name") or "").strip()
    if not name:
        return []
    parent = (c.get("parent_class") or "").strip()
    header = f"class {name}({parent}):" if parent else f"class {name}:"

    decorators = c.get("decorators") or []
    variables = c.get("variables") or []
    methods = c.get("methods") or []

    lines: list[str] = []
    for dec in decorators:
        dec_clean = (dec or "").strip()
        if dec_clean:
            lines.append(f"@{dec_clean}")
    lines.append(header)

    body_lines: list[str] = []
    for v in variables:
        body_lines.extend(_emit_variable(v))
    for m in methods:
        if body_lines:
            body_lines.append("")  # blank line between members
        body_lines.extend(_emit_method(m))

    if not body_lines:
        body_lines = ["pass"]

    lines.extend(f"    {ln}" for ln in body_lines)
    lines.append("")
    return lines


def _emit_function(f: dict[str, Any]) -> list[str]:
    """Emit a `def name(params) -> return_type: body` block. Parameters are
    typed too. Empty body becomes `pass` so the def parses."""
    name = (f.get("name") or "").strip()
    if not name:
        return []
    return_type = f.get("return_type", "None")
    py_return = _PY_TYPE.get(return_type, "None")

    params = f.get("parameters") or []
    params_parts: list[str] = []
    for p in params:
        pname = (p.get("name") or "").strip()
        if not pname:
            continue
        ptype = _PY_TYPE.get(p.get("type", "Int"), "object")
        params_parts.append(f"{pname}: {ptype}")
    params_str = ", ".join(params_parts)

    body = f.get("body") or ""
    body_lines = [ln for ln in body.splitlines() if ln.strip() != ""]
    if not body_lines:
        body_lines = ["pass"]
    return [
        f"def {name}({params_str}) -> {py_return}:",
        *[f"    {line}" for line in body_lines],
        "",
    ]


def _emit_gate(node: dict[str, Any]) -> list[str]:
    """Lines of Python for a single non-execution node. Unknown node types
    are emitted as a Python comment so the script stays runnable — silently
    dropping would mask config drift between frontend/backend."""
    ntype = node.get("type", "")
    data = node.get("data") or {}

    if ntype in _SINGLE_QUBIT_GATE:
        op = _SINGLE_QUBIT_GATE[ntype]
        q = int(data.get("qubit_index", 0))
        return [f"qc.{op}({q})"]

    if ntype == NODE_CNOT:
        ctrl = int(data.get("control_qubit", 0))
        tgt = int(data.get("target_qubit", 1))
        return [f"qc.cx({ctrl}, {tgt})"]

    if ntype == NODE_MEASURE:
        q = int(data.get("qubit_index", 0))
        c = int(data.get("classical_index", 0))
        return [f"qc.measure({q}, {c})"]

    if ntype == NODE_BARRIER:
        return ["qc.barrier()"]

    return [f"# unknown node type: {ntype!r}"]


def generate_python(graph: dict[str, Any]) -> str:
    """Turn a graph_json into a Qiskit script string.

    Always emits header (imports + QuantumCircuit). Run / Plot Histogram are
    only emitted if their nodes are present — a Hello World with no
    Run-Simulator node will still compile and exit cleanly, just without
    output.
    """
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []
    config = graph.get("config") or {}
    variables = graph.get("variables") or []
    functions = graph.get("functions") or []
    classes = graph.get("classes") or []

    num_qubits = max(1, int(config.get("num_qubits", 2)))
    num_classical = max(1, int(config.get("num_classical", 2)))
    default_shots = max(1, int(config.get("shots", 1000)))

    sorted_nodes = _topo_sort(nodes, edges)

    has_run = any(n.get("type") == NODE_RUN_SIM for n in sorted_nodes)
    has_plot = any(n.get("type") == NODE_PLOT_HIST for n in sorted_nodes)

    lines: list[str] = [
        "# Auto-generated by node-forge — do not hand-edit.",
        "from qiskit import QuantumCircuit, transpile",
    ]
    if has_run:
        lines.append("from qiskit_aer import AerSimulator")
    if has_plot:
        lines.append("import matplotlib")
        lines.append("matplotlib.use('Agg')")
        lines.append("from qiskit.visualization import plot_histogram")

    # User-defined variables and functions sit between imports and the
    # QuantumCircuit setup so the rest of the script can see them. v1
    # doesn't connect them to canvas nodes — they're emitted unconditionally
    # and are referenceable from any future Python-node type we add.
    if variables:
        lines.append("")
        lines.append("# Variables")
        for v in variables:
            lines.extend(_emit_variable(v))
    if functions:
        lines.append("")
        lines.append("# Functions")
        for f in functions:
            lines.extend(_emit_function(f))
    if classes:
        lines.append("")
        lines.append("# Classes")
        for c in classes:
            lines.extend(_emit_class(c))

    lines.append("")
    lines.append(f"qc = QuantumCircuit({num_qubits}, {num_classical})")

    # Track the shots from the Run node if present; default to circuit-level
    # config otherwise. A graph with multiple Run nodes uses the LAST one's
    # shots — a quirk worth flagging in the UI later, but rare in practice.
    run_shots = default_shots
    for n in sorted_nodes:
        ntype = n.get("type")
        if ntype == NODE_RUN_SIM:
            run_shots = int((n.get("data") or {}).get("shots", default_shots))
        elif ntype == NODE_PLOT_HIST:
            # Plot is rendered after the Run block below; nothing to emit
            # inline here.
            pass
        else:
            lines.extend(_emit_gate(n))

    if has_run:
        lines.append("")
        lines.append("_sim = AerSimulator()")
        lines.append("_tqc = transpile(qc, _sim)")
        lines.append(f"_job = _sim.run(_tqc, shots={run_shots})")
        lines.append("_counts = _job.result().get_counts()")
        lines.append("print('Counts:', _counts)")

    if has_plot:
        if not has_run:
            # The Plot Histogram node depends on `_counts`. If the user wired
            # Plot without a Run, emit a clear runtime error rather than a
            # NameError deep in qiskit.
            lines.append("")
            lines.append(
                "raise RuntimeError('PlotHistogram requires a Run node upstream')"
            )
        else:
            lines.append("_fig = plot_histogram(_counts)")
            lines.append("_fig.savefig('histogram.png', bbox_inches='tight')")
            lines.append("print('Saved histogram.png')")

    lines.append("")
    return "\n".join(lines)
