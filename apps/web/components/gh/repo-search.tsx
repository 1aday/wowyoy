"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

/** "owner/repo", "github.com/owner/repo" or a full GitHub URL, to the canonical path. */
export function parseRepoInput(text: string): string | null {
  const t = text.trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?github\.com\//i, "").replace(/[?#].*$/, "")
  const m = /^([a-z\d][a-z\d-]{0,38})\/([\w.-]{1,100}?)(?:\.git)?\/?(?:\/.*)?$/i.exec(t)
  return m ? `/gh/${m[1]!.toLowerCase()}/${m[2]!.toLowerCase()}` : null
}

export function RepoSearch({ autoFocus, className }: { autoFocus?: boolean; className?: string }) {
  const router = useRouter()
  const [text, setText] = React.useState("")
  const [error, setError] = React.useState(false)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const path = parseRepoInput(text)
    setError(!path)
    if (path) router.push(path)
  }
  return (
    <form onSubmit={submit} className={cn("w-full max-w-xl", className)} role="search">
      <label htmlFor="gh-repo" className="label-mono mb-2 block">
        Any public repo
      </label>
      <div className="flex gap-2">
        <Input
          id="gh-repo"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(false)
          }}
          placeholder="owner/repo"
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={error || undefined}
          aria-describedby={error ? "gh-repo-error" : undefined}
          className="h-10 font-mono text-[14px]"
        />
        <Button type="submit" size="lg" className="h-10 px-4 text-[14px]">
          Read <ArrowRight strokeWidth={1.5} />
        </Button>
      </div>
      {error && (
        <p id="gh-repo-error" className="mt-2 text-[13px] text-down">
          Type it as owner/repo, like posthog/posthog, or paste the GitHub link.
        </p>
      )}
    </form>
  )
}
