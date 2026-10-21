import Link from "next/link"
import { Prompt } from "@workspace/ui/brand/prompt"
import { RepoSearch } from "./repo-search"

const examples = ["posthog/posthog", "supabase/supabase", "calcom/cal.com", "medusajs/medusa"]

/** The frame every non-data state shares: a command line, the answer in Pixel, one paragraph, a way on. */
function StateFrame({ command, title, children }: { command: string; title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-8">
      <Prompt command="repo_pulse" flags={command} className="mb-4" />
      <h1 className="pixel-46 max-w-4xl text-balance max-sm:pixel-33" data-testid="state-headline">
        {title}
        <span className="cursor-block" aria-hidden />
      </h1>
      <div className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">{children}</div>
      <RepoSearch className="mt-10" />
      <p className="mt-4 text-[13.5px] text-muted-foreground">
        Or try{" "}
        {examples.map((e, i) => (
          <span key={e}>
            {i > 0 && ", "}
            <Link href={`/gh/${e}`} prefetch={false} className="font-mono text-foreground underline-offset-4 hover:underline">
              {e}
            </Link>
          </span>
        ))}
        .
      </p>
    </main>
  )
}

export function RepoNotFound() {
  return (
    <StateFrame command="--repo ?" title="No public repo here.">
      <p>
        Repo Pulse reads public GitHub repos only. This one doesn&apos;t exist, is private, or was renamed in a way GitHub no longer
        redirects. Check the spelling: it&apos;s owner/repo, as in the GitHub URL.
      </p>
    </StateFrame>
  )
}

function resetIn(resetAt: string | null) {
  if (!resetAt) return null
  const min = Math.ceil((Date.parse(resetAt) - Date.now()) / 60e3)
  return min > 0 && min < 120 ? min : null
}

export function RepoUnavailable({ fullName, resetAt }: { fullName: string; resetAt: string | null }) {
  const min = resetIn(resetAt)
  return (
    <StateFrame command={`--repo ${fullName.toLowerCase()}`} title="GitHub's numbers are temporarily unavailable.">
      <p>
        wowyoy couldn&apos;t read {fullName} from GitHub just now
        {min ? `, because the hourly API allowance ran out. It resets in about ${min} minutes` : ", because GitHub didn't answer"}. This
        page tries again by itself within a few minutes; nothing is guessed in the meantime.
      </p>
    </StateFrame>
  )
}

export function RepoOptedOut({ fullName }: { fullName: string }) {
  return (
    <StateFrame command={`--repo ${fullName.toLowerCase()}`} title="This repo opted out.">
      <p>
        The maintainers of {fullName} asked wowyoy not to publish its weekly numbers, so none are read or shown here. To turn Repo Pulse
        back on, remove the <code className="font-mono text-[15px] text-foreground">.wowyoy</code> file from the repo root.
      </p>
    </StateFrame>
  )
}
