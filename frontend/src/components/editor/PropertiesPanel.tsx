"use client";

import { useEditor } from "@/stores/editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PropertiesPanel() {
  const config = useEditor((s) => s.config);
  const setConfig = useEditor((s) => s.setConfig);
  const selectedNode = useEditor((s) =>
    s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) : null,
  );

  return (
    <aside className="w-[280px] shrink-0 overflow-y-auto border-l bg-muted/30 p-4">
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Configuração do circuito
        </h2>
        <div className="space-y-2">
          <Label htmlFor="num-qubits" className="text-xs">
            Qubits
          </Label>
          <Input
            id="num-qubits"
            type="number"
            min={1}
            max={32}
            value={config.num_qubits}
            onChange={(e) =>
              setConfig({ num_qubits: Math.max(1, Number(e.target.value)) })
            }
            className="h-8"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="num-classical" className="text-xs">
            Bits clássicos
          </Label>
          <Input
            id="num-classical"
            type="number"
            min={1}
            max={32}
            value={config.num_classical}
            onChange={(e) =>
              setConfig({ num_classical: Math.max(1, Number(e.target.value)) })
            }
            className="h-8"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="default-shots" className="text-xs">
            Shots padrão
          </Label>
          <Input
            id="default-shots"
            type="number"
            min={1}
            value={config.shots}
            onChange={(e) =>
              setConfig({ shots: Math.max(1, Number(e.target.value)) })
            }
            className="h-8"
          />
        </div>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nodo selecionado
        </h2>
        {selectedNode ? (
          <div className="rounded border bg-background p-2 text-xs">
            <div>
              <span className="text-muted-foreground">Tipo:</span>{" "}
              <span className="font-mono">{selectedNode.type}</span>
            </div>
            <div className="mt-1">
              <span className="text-muted-foreground">id:</span>{" "}
              <span className="font-mono">{selectedNode.id}</span>
            </div>
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-1 text-[11px]">
              {JSON.stringify(selectedNode.data, null, 2)}
            </pre>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Clique num nodo no canvas para ver/editar suas propriedades.
          </p>
        )}
      </section>
    </aside>
  );
}
