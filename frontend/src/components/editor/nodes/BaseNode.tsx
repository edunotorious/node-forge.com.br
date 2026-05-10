import { Handle, Position } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

interface BaseNodeProps {
  selected?: boolean;
  isolated?: boolean;
  warning?: string;
  showInput?: boolean;
  showOutput?: boolean;
  children: React.ReactNode;
}

export function BaseNode({
  selected,
  isolated,
  warning,
  showInput = true,
  showOutput = true,
  children,
}: BaseNodeProps) {
  return (
    <div
      className={cn(
        "min-w-[140px] rounded-md border-2 bg-card shadow-sm",
        "border-border",
        isolated && "border-dashed border-yellow-500",
        warning && "border-yellow-500",
        selected && "ring-2 ring-primary ring-offset-1",
      )}
    >
      {showInput && <Handle type="target" position={Position.Left} />}
      <div className="p-2">
        {warning && (
          <div className="mb-1 flex items-center gap-1 text-yellow-600">
            <AlertTriangle className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wide">{warning}</span>
          </div>
        )}
        {children}
      </div>
      {showOutput && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
