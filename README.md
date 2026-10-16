# ▲ wowyoy

Your growth, read every Monday. Connect your analytics and get one table and one sentence: what moved your business this week, and whether it's real or a fluke.

wowyoy is open source. It reads your product analytics (PostHog first), maps your events to a canonical set of growth metrics, and renders a weekly read: each metric this week against last week, the trailing four weeks, the quarter and last year, with every move marked as either inside or outside its normal range.

> Status: early. This repository currently holds the design system, the metric math and a design kit page running on seeded sample data. Data connectors come next.

## What's here

| Path | What it holds |
| --- | --- |
| `apps/web` | Next.js app. `/kit` renders every component on sample data in light and dark. |
| `packages/ui` | shadcn/ui components, the theme, and brand components: `Delta`, `MetricValue`, `Verdict`, `PulseTable` and the chart kit (stock Recharts). |
| `packages/metrics` | Metric catalog, comparisons and noise math, rule-written weekly headline, seeded sample store. |

## How a move is judged

For every metric and comparison, the change is compared with the same comparison over the previous 26 weeks. A move more than two standard deviations from its usual size is marked as outside normal noise (a filled pill). Everything else is shown as plain colored text. Color only ever means direction: green ▲ up, red ▼ down.

The headline is written from the data by fixed rules, for example "Revenue ▼9%. Checkout is the leak." or "Nothing moved beyond noise." No model writes it.

## Develop

Requires Node 20.9+ and pnpm 10.

```bash
pnpm install
pnpm dev          # http://localhost:3000, design kit at /kit
pnpm test         # unit tests for the metric math
pnpm typecheck
pnpm build
pnpm --filter web test:e2e   # Playwright smoke tests against a production build
```

Keyboard on `/kit`: `[` and `]` change week, `J` and `K` change metric, `D` toggles theme, `⌘K` opens the command line.

## Stack

Next.js (App Router), shadcn/ui on Radix, Tailwind CSS v4, Recharts via shadcn charts, TanStack Table, NumberFlow, cmdk, Lucide, nuqs, Turborepo.

## License

MIT
