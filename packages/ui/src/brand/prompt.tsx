import { cn } from "@workspace/ui/lib/utils"

/** Command-line label above a table or chart: `> weekly_read --compare wow,yoy` */
export function Prompt({ command, flags, className }: { command: string; flags?: string; className?: string }) {
  return (
    <div className={cn("font-mono text-xs text-muted-foreground", className)}>
      <span className="text-up">&gt;</span> <span className="text-foreground">{command}</span>
      {flags && <span> {flags}</span>}
    </div>
  )
}
