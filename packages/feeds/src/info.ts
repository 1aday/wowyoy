import type { FeedId, FeedInfo } from "./types"

const DAY = 86400

/** The eight world feeds and the Standard metrics each can move. */
export const feedInfo: Record<FeedId, FeedInfo> = {
  stripe: {
    id: "stripe",
    name: "Stripe incidents",
    home: "https://status.stripe.com",
    revalidate: DAY,
    affects: ["checkout-conversion", "payment-success-rate", "net-revenue", "orders", "conversion-rate", "churned-mrr", "mrr"],
  },
  cloudflare: {
    id: "cloudflare",
    name: "Cloudflare incidents",
    home: "https://www.cloudflarestatus.com",
    revalidate: DAY,
    affects: ["sessions", "unique-visitors", "conversion-rate", "bounce-rate", "error-rate", "dau"],
  },
  "google-search": {
    id: "google-search",
    name: "Google Search updates",
    home: "https://status.search.google.com",
    revalidate: DAY,
    affects: ["organic-sessions", "sessions", "signups", "new-customers"],
  },
  "app-stores": {
    id: "app-stores",
    name: "App Store and Play releases",
    home: "https://developer.apple.com/news/releases/",
    revalidate: 7 * DAY,
    affects: ["mobile-conversion-rate", "dau", "error-rate", "week-1-retention"],
  },
  holidays: {
    id: "holidays",
    name: "Public holidays",
    home: "https://github.com/commenthol/date-holidays",
    revalidate: 365 * DAY,
    affects: ["sessions", "orders", "net-revenue", "signups", "dau", "wau"],
  },
  shopping: {
    id: "shopping",
    name: "Shopping calendar",
    home: "https://wowyoy.com/w",
    revalidate: 365 * DAY,
    affects: ["net-revenue", "orders", "aov", "conversion-rate", "sessions", "discount-rate"],
  },
  "ad-platforms": {
    id: "ad-platforms",
    name: "Ad platform outages",
    home: "https://metastatus.com",
    revalidate: DAY,
    affects: ["paid-sessions", "ad-spend", "cpc", "cpm", "roas", "mer", "ncac", "blended-cac"],
  },
  dst: {
    id: "dst",
    name: "Daylight saving changes",
    home: "https://www.timeanddate.com/time/dst/",
    revalidate: 365 * DAY,
    affects: [],
  },
}
