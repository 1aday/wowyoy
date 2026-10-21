import { cn } from "@workspace/ui/lib/utils"

/** The quiet mark on every page compiled from an unreviewed spec. Never coloured: a draft is not a direction. */
export function DraftMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-dashed border-border px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] text-muted-foreground uppercase",
        className,
      )}
      title="This spec has not been signed off yet. The page is a preview and is not indexed."
    >
      <span className="size-1.5 rounded-full border border-muted-foreground" aria-hidden />
      Draft · not yet reviewed
    </span>
  )
}
