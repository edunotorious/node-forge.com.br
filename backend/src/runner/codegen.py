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


_BOOL_TRUE = {"true", "yes", "1", "y", "t"}
_BOOL_FALSE = {"false", "no", "0", "n", "f"}


def _coerce_value(type_name: str, raw_value: str) -> str:
    """Turn the user's free-form string into a Python literal of the
    declared type. Forgiving on the cases where the dialog's "value" field
    naturally collects shorthand:

      * Str  — wraps in repr() so `FIAP` becomes `"FIAP"`. If the user
               already wrote a string literal (`'x'` or `"x"`), we leave
               it alone.
      * Bool — accepts true/false/yes/no/1/0 (any case) and emits True or
               False. Anything else falls through to the user's literal so
               valid Python like `not x` still works.
      * Int / Float / List / Dict — emitted as-is. Bad input is the user's
               problem and surfaces as a Python error in the Console.

    Empty value falls back to the type's natural default ("" → 0, "" → "",
    "" → False, etc.).
    """
    raw = raw_value.strip()
    if not raw:
        return _DEFAULT_LITERAL.get(type_name, "None")

    if type_name == "Str":
        # Already a string literal? Trust it.
        if (raw.startswith("'") and raw.endswith("'")) or (
            raw.startswith('"') and raw.endswith('"')
        ):
            return raw
        return repr(raw)

    if type_name == "Bool":
        lower = raw.lower()
        if lower in _BOOL_TRUE:
            return "True"
        if lower in _BOOL_FALSE:
            return "False"
        return raw

    return raw


def _emit_variable(v: dict[str, Any]) -> list[str]:
    """One `name: type = value` line per user-defined variable. The value
    is coerced per type (see `_coerce_value`) so `Str FIAP` becomes
    `name: str = "FIAP"` instead of a NameError at execution time."""
    name = (v.get("name") or "").strip()
    if not name:
        return []
    type_name = v.get("type", "Int")
    py_type = _PY_TYPE.get(type_name, "object")
    raw_value = (v.get("value") or "").strip()
    value = _coerce_value(type_name, raw_value)
    return [f"{name}: {py_type} = {value}"]


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


def _emit_user_defs(
    variables: list[dict[str, Any]],
    functions: list[dict[str, Any]],
    classes: list[dict[str, Any]],
) -> list[str]:
    """Lines for the user-defined items (vars + funcs + classes) only.
    Shared by `generate_python` (full circuit script) and
    `generate_preamble` (Terminal REPL preamble)."""
    lines: list[str] = []
    if variables:
        lines.append("# Variables")
        for v in variables:
            lines.extend(_emit_variable(v))
    if functions:
        if lines:
            lines.append("")
        lines.append("# Functions")
        for f in functions:
            lines.extend(_emit_function(f))
    if classes:
        if lines:
            lines.append("")
        lines.append("# Classes")
        for c in classes:
            lines.extend(_emit_class(c))
    return lines


def generate_preamble(graph: dict[str, Any]) -> str:
    """Just the user-defined items, no QuantumCircuit / gates / run.
    The Terminal REPL feeds this in silently before history so a user can
    reference everything they declared in Details + Classes."""
    variables = graph.get("variables") or []
    functions = graph.get("functions") or []
    classes = graph.get("classes") or []
    lines = _emit_user_defs(variables, functions, classes)
    return "\n".join(lines)


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

    # User-defined items between imports and the QuantumCircuit setup so
    # the rest of the script can see them.
    user_defs = _emit_user_defs(variables, functions, classes)
    if user_defs:
        lines.append("")
        lines.extend(user_defs)

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
