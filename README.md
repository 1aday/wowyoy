# ▲ wowyoy

Your growth, read every Monday. Connect your analytics and get one table and one sentence: what moved your business this week, and whether it's real or a fluke.

wowyoy is open source. It reads your product analytics (PostHog first), maps your events to a canonical set of growth metrics, and renders a weekly read: each metric this week against last week, the trailing four weeks, the quarter and last year, with every move marked as either inside or outside its normal range.

> Status: v1. Connect PostHog (or open the sample workspace), review how your events map to metrics, and read the weekly Pulse, a Year in Mondays backfill and the free Fluke Test.

## What's here

| Path | What it holds |
| --- | --- |
| `apps/web` | Next.js app. `/` landing, `/demo` sample workspace, `/connect` PostHog setup and mapping review, `/app` your workspace (Pulse, Year in Mondays, Mapping), `/fluke` the free Fluke Test, `/kit` the design kit. |
| `packages/sources` | PostHog client, event discovery, Claude and rule-based event mapping, and the fixed HogQL compiler for weekly measures. |
| `packages/ui` | shadcn/ui components, the theme, and brand components: `Delta`, `MetricValue`, `Verdict`, `PulseTable` and the chart kit (stock Recharts). |
| `packages/metrics` | Metric catalog, fixed formulas from weekly measures, comparisons and noise math, rule-written weekly headline, A Year in Mondays, the Fluke Test, seeded sample store. |

## How a move is judged

For every metric and comparison, the change is compared with the same comparison over the previous 26 weeks. A move more than two standard deviations from its usual size is marked as outside normal noise (a filled pill). Everything else is shown as plain colored text. Color only ever means direction: green ▲ up, red ▼ down.

The Fluke Test judges a single pasted series. It reads one week's noise from the moving ranges of up to 26 weeks. Comparing two weeks puts two weeks of noise in play, so a week-over-week change has to clear 2 × √2 of one week's noise before it counts as real.

The headline is written from the data by fixed rules, for example "Revenue ▼9%. Checkout is the leak." or "Nothing moved beyond noise." No model writes it.

## Connecting PostHog

Setup asks for a PostHog personal API key with read access to Project and Query. wowyoy lists your events, proposes a mapping from events to measures (orders, revenue, sessions and so on), and shows it for review before reading any history. Claude proposes the mapping when an Anthropic key is available; otherwise common event names are matched by rule. Every measure compiles to a fixed HogQL query; no model writes queries.

The connection is kept in an encrypted, httpOnly cookie on your browser. There is no database.

| Variable | Needed | What it does |
| --- | --- | --- |
| `WOWYOY_SECRET` | In production | Long random string that encrypts the connection cookie. Without it, `/connect` explains that the deployment can't store a connection. |
| `ANTHROPIC_API_KEY` | Optional | Lets Claude propose mappings for everyone. Without it, users can paste their own key on `/connect`. |
| `WOWYOY_ALLOW_PRIVATE_HOSTS` | Optional | `1` allows self-hosted PostHog on http or private network addresses. Off by default. |
| `WOWYOY_INSECURE_COOKIES` | Optional | `1` drops the `Secure` cookie flag, for local http testing only. |

## Develop

Requires Node 20.9+ and pnpm 10.

```bash
pnpm install
pnpm dev          # http://localhost:3000, design kit at /kit
pnpm test         # unit tests for the metric math and sources
pnpm typecheck
pnpm build
pnpm --filter web test:e2e   # Playwright tests against a production build and a mock PostHog
```

Keyboard in a workspace: `1` `2` `3` switch views, `[` and `]` change week, `⌘K` opens the command line. On `/kit`: `[` and `]` change week, `J` and `K` change metric, `D` toggles theme, `⌘K` opens the command line.

## Stack

Next.js (App Router), shadcn/ui on Radix, Tailwind CSS v4, Recharts via shadcn charts, TanStack Table, NumberFlow, cmdk, Lucide, nuqs, Turborepo.

## License

MIT
