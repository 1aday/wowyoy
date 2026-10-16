import { cn } from "@workspace/ui/lib/utils"

/** `▲ wowyoy` with the ▲ in the up color and the blinking block cursor. */
export function Logo({ className, cursor = true }: { className?: string; cursor?: boolean }) {
  return (
    <span className={cn("inline-flex items-baseline font-pixel text-[22px] leading-none tracking-normal", className)}>
      <span className="text-up" aria-hidden>
        ▲
      </span>
      <span className="ml-[0.3em]">wowyoy</span>
      {cursor && <span className="cursor-block" aria-hidden />}
    </span>
  )
}
