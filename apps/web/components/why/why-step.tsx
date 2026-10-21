import { cn } from "@workspace/ui/lib/utils"

/** One of the Why page's three steps: a numbered node on a rail, the step's label, its question and its content. */
export function WhyStep({
  n,
  id,
  label,
  title,
  lead,
  last = false,
  children,
}: {
  n: number
  id: string
  label: string
  title: React.ReactNode
  lead?: React.ReactNode
  last?: boolean
  children?: React.ReactNode
}) {
  return (
    <li id={id} aria-labelledby={`${id}-title`} className="relative grid scroll-mt-20 grid-cols-[2rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-x-8">
      <div className="relative flex justify-center" aria-hidden>
        <span className="num relative z-10 grid size-8 place-items-center rounded-full border border-foreground bg-background text-[14px] sm:size-11 sm:text-[17px]">
          {n}
        </span>
        {!last && <span className="absolute top-8 bottom-0 w-px bg-border sm:top-11" />}
      </div>
      <div className={cn("min-w-0 pt-1 sm:pt-2.5", last ? "pb-4" : "pb-16 sm:pb-24")}>
        <div className="label-mono">
          Step {n} · {label}
        </div>
        <h2 id={`${id}-title`} className="mt-3 max-w-3xl text-[24px] leading-tight tracking-[-0.015em] text-balance sm:text-[30px]">
          {title}
        </h2>
        {lead && <div className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">{lead}</div>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </li>
  )
}
