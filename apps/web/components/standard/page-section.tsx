import { cn } from "@workspace/ui/lib/utils"

/**
 * The shared rhythm of the Standard and Why pages: a hairline, an uppercase mono label in a
 * left rail (stacked above on narrow screens), and the content. `title` states the section's answer.
 */
export function PageSection({
  id,
  label,
  note,
  title,
  children,
  className,
}: {
  id: string
  label: string
  /** A short line under the label, for context the title doesn't carry. */
  note?: React.ReactNode
  title?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} aria-labelledby={title ? `${id}-title` : undefined} className={cn("scroll-mt-20 border-t border-border py-12 sm:py-16", className)}>
      <div className="grid gap-x-12 gap-y-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="lg:pt-1.5">
          <div className="label-mono">{label}</div>
          {note && <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground max-lg:hidden">{note}</p>}
        </div>
        <div className="min-w-0">
          {title && (
            <h2 id={`${id}-title`} className="max-w-3xl text-[21px] leading-snug tracking-[-0.01em] text-balance sm:text-[24px]">
              {title}
            </h2>
          )}
          {children && <div className={cn(title && "mt-6")}>{children}</div>}
        </div>
      </div>
    </section>
  )
}

/** The page container every compiled page uses. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cn("mx-auto w-full max-w-6xl px-4 pb-8 sm:px-8", className)}>{children}</main>
}
