import { rng } from "@workspace/metrics"
import type { RepoMeasure } from "../types"

/**
 * Offline stand-ins for GitHub, used by tests, local dev and e2e (WOWYOY_GITHUB_FIXTURES=1), never in production.
 * A scenario is a repo's weekly counts; the fixture transport turns them back into the API's own
 * responses (stargazer pages, fork lists, search counts, commit activity) dated relative to now.
 */
export interface RepoScenario {
  repo: {
    full_name: string
    description: string | null
    homepage?: string | null
    language: string | null
    stargazers_count: number
    forks_count: number
    open_issues_count: number
    created_at: string
    default_branch?: string
  }
  /** Weekly counts, oldest first; the last entry is the week still open, so far. */
  weekly: Record<RepoMeasure, number[]>
  private?: boolean
  optOut?: boolean
  rateLimited?: boolean
}

/** Hand-written repos: 26 closed weeks and the open one. */
export const scenarios: Record<string, RepoScenario> = {
  "posthog/posthog": {
    repo: {
      full_name: "PostHog/posthog",
      description:
        "🦔 PostHog provides open-source web & product analytics, session recording, feature flagging and A/B testing that you can self-host.",
      homepage: "https://posthog.com",
      language: "Python",
      stargazers_count: 29412,
      forks_count: 1903,
      open_issues_count: 2911,
      created_at: "2020-01-23T22:59:24Z",
      default_branch: "master",
    },
    weekly: {
      stars: [58, 61, 55, 64, 59, 67, 62, 57, 60, 66, 63, 58, 61, 69, 64, 60, 57, 65, 62, 59, 63, 68, 61, 64, 66, 98, 31],
      forks: [9, 11, 8, 12, 10, 7, 11, 9, 13, 10, 8, 12, 9, 11, 10, 14, 9, 8, 12, 10, 11, 9, 13, 10, 8, 12, 4],
      "issues-opened": [41, 47, 39, 52, 44, 48, 43, 50, 46, 42, 49, 45, 51, 44, 47, 40, 53, 46, 43, 48, 45, 50, 42, 47, 44, 49, 19],
      "issues-closed": [38, 42, 35, 47, 40, 44, 39, 45, 41, 37, 46, 40, 48, 39, 43, 36, 49, 42, 38, 45, 41, 46, 37, 43, 40, 44, 17],
      "prs-merged": [112, 125, 118, 131, 109, 122, 127, 115, 120, 133, 117, 124, 129, 111, 121, 126, 119, 132, 114, 123, 128, 116, 125, 130, 119, 111, 52],
      commits: [151, 166, 158, 172, 149, 163, 170, 155, 160, 176, 157, 165, 171, 150, 162, 168, 159, 174, 153, 164, 169, 156, 166, 173, 161, 142, 70],
    },
  },
  "vercel/next.js": {
    repo: {
      full_name: "vercel/next.js",
      description: "The React Framework",
      homepage: "https://nextjs.org",
      language: "JavaScript",
      stargazers_count: 131840,
      forks_count: 28710,
      open_issues_count: 3402,
      created_at: "2016-10-05T23:32:51Z",
      default_branch: "canary",
    },
    weekly: {
      stars: Array(27).fill(0),
      forks: [96, 104, 91, 110, 99, 107, 95, 102, 98, 113, 101, 94, 105, 100, 97, 108, 103, 92, 106, 99, 111, 96, 104, 100, 98, 102, 41],
      "issues-opened": [88, 95, 82, 101, 90, 97, 86, 93, 89, 104, 91, 84, 96, 92, 87, 99, 94, 83, 98, 90, 102, 88, 95, 91, 89, 93, 37],
      "issues-closed": [71, 80, 66, 85, 74, 82, 69, 77, 73, 88, 75, 68, 81, 76, 70, 84, 78, 67, 83, 74, 86, 72, 79, 75, 73, 129, 30],
      "prs-merged": [142, 155, 137, 161, 148, 158, 140, 152, 146, 166, 150, 139, 157, 149, 143, 163, 154, 136, 160, 147, 165, 141, 156, 150, 145, 153, 61],
      commits: [210, 228, 199, 236, 214, 231, 205, 222, 212, 243, 219, 203, 230, 217, 208, 239, 224, 198, 234, 213, 241, 207, 226, 218, 211, 221, 88],
    },
  },
  "1aday/wowyoy": {
    repo: {
      full_name: "1aday/wowyoy",
      description: "Your growth, read every Monday. One table, one sentence: what moved, and whether it's real.",
      homepage: "https://wowyoy.com",
      language: "TypeScript",
      stargazers_count: 41,
      forks_count: 3,
      open_issues_count: 2,
      created_at: "2026-03-02T10:11:00Z",
      default_branch: "main",
    },
    weekly: {
      stars: [0, 1, 0, 0, 2, 1, 0, 0, 1, 3, 0, 1, 0, 2, 1, 0, 4, 2, 1, 0, 3, 2, 1, 5, 3, 4, 1],
      forks: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      "issues-opened": [0, 1, 0, 0, 0, 2, 0, 1, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 1, 0, 0],
      "issues-closed": [0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0],
      "prs-merged": [2, 4, 3, 5, 2, 6, 4, 3, 5, 7, 4, 3, 6, 5, 4, 8, 5, 3, 6, 4, 7, 5, 6, 4, 5, 6, 2],
      commits: [18, 26, 21, 34, 19, 41, 28, 24, 33, 47, 29, 22, 38, 31, 27, 52, 36, 23, 40, 30, 45, 33, 39, 29, 35, 41, 12],
    },
  },
  "wowyoy-fixtures/private-repo": {
    repo: {
      full_name: "wowyoy-fixtures/private-repo",
      description: null,
      language: null,
      stargazers_count: 0,
      forks_count: 0,
      open_issues_count: 0,
      created_at: "2025-01-01T00:00:00Z",
    },
    weekly: flat(0),
    private: true,
  },
  "wowyoy-fixtures/opted-out": {
    repo: {
      full_name: "wowyoy-fixtures/opted-out",
      description: "A repo whose maintainers turned Repo Pulse off.",
      language: "Go",
      stargazers_count: 812,
      forks_count: 40,
      open_issues_count: 12,
      created_at: "2024-05-01T00:00:00Z",
    },
    weekly: flat(5),
    optOut: true,
  },
  "wowyoy-fixtures/rate-limited": {
    repo: {
      full_name: "wowyoy-fixtures/rate-limited",
      description: null,
      language: null,
      stargazers_count: 0,
      forks_count: 0,
      open_issues_count: 0,
      created_at: "2025-01-01T00:00:00Z",
    },
    weekly: flat(0),
    rateLimited: true,
  },
}

function flat(n: number): Record<RepoMeasure, number[]> {
  const w = Array(27).fill(n) as number[]
  return { stars: w, forks: w, "issues-opened": w, "issues-closed": w, "prs-merged": w, commits: w }
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * A plausible repo for any name, the same every time: steady weeks with Poisson-sized noise and,
 * for some repos, one real move in the latest closed week. `elapsed` is how much of the open week has passed (0–1).
 */
export function synthScenario(fullName: string, elapsed: number): RepoScenario {
  const r = rng(hash(fullName.toLowerCase()))
  const scale = Math.exp(r.next() * 5) // 1–150
  const base: Record<RepoMeasure, number> = {
    stars: Math.round(4 + scale * 1.6),
    forks: Math.round(1 + scale * 0.25),
    "issues-opened": Math.round(2 + scale * 0.45),
    "issues-closed": Math.round(2 + scale * 0.4),
    "prs-merged": Math.round(3 + scale * 0.9),
    commits: Math.round(8 + scale * 1.4),
  }
  const moved = r.next() < 0.45 ? (Object.keys(base) as RepoMeasure[])[Math.floor(r.next() * 6)] : null
  const factor = r.next() < 0.7 ? 1.5 + r.next() * 0.5 : 0.45 + r.next() * 0.15
  const weekly = Object.fromEntries(
    (Object.keys(base) as RepoMeasure[]).map((m) => {
      const b = base[m]
      const trend = 1 + (r.next() - 0.5) * 0.3
      const w = Array.from({ length: 26 }, (_, i) => {
        const level = b * (1 + ((trend - 1) * i) / 25)
        return Math.max(0, Math.round(level + r.normal() * Math.sqrt(level) * 0.9))
      })
      if (m === moved) w[25] = Math.round(w[25]! * factor)
      w.push(Math.round(b * elapsed * (0.85 + r.next() * 0.3)))
      return [m, w]
    }),
  ) as Record<RepoMeasure, number[]>
  const windowStars = weekly.stars.reduce((a, b) => a + b, 0)
  const windowForks = weekly.forks.reduce((a, b) => a + b, 0)
  const [owner = "", name = ""] = fullName.split("/")
  return {
    repo: {
      full_name: `${owner}/${name}`,
      description: null,
      language: null,
      stargazers_count: Math.round(windowStars * (3 + r.next() * 30)),
      forks_count: Math.round(windowForks * (3 + r.next() * 12)),
      open_issues_count: Math.round(base["issues-opened"] * 20),
      created_at: "2019-06-01T00:00:00Z",
    },
    weekly,
  }
}
