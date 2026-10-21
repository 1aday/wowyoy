import apple from "../fixtures/apple-releases.json" with { type: "json" }
import cloudflareHistory from "../fixtures/cloudflare-history-1.json" with { type: "json" }
import cloudflareIncidents from "../fixtures/cloudflare-incidents.json" with { type: "json" }
import googleAds from "../fixtures/google-ads-incidents.json" with { type: "json" }
import googleSearch from "../fixtures/google-search-incidents.json" with { type: "json" }
import metaAds from "../fixtures/meta-ads-manager-history.json" with { type: "json" }
import stripeHistory from "../fixtures/stripe-history-1.json" with { type: "json" }
import stripeIncidents from "../fixtures/stripe-incidents.json" with { type: "json" }
import { appleReleasesUrl } from "./adapters/apple"
import { googleAdsUrl, googleSearchUrl } from "./adapters/google-status"
import { metaAdsUrl } from "./adapters/meta-status"
import { statuspageSites } from "./adapters/statuspage"
import type { FetchLike } from "./source"

/**
 * Recorded copies of every source (trimmed), for contract tests and for running the site without
 * the network (WOWYOY_FEED_FIXTURES=1). Read them with `now: FIXTURES_RECORDED_AT` so trailing
 * windows and history pages line up with the day they were recorded.
 */
export const FIXTURES_RECORDED_AT = new Date("2026-10-21T02:38:00Z")

export const fixtures = {
  [`${statuspageSites.cloudflare.history}?page=1`]: cloudflareHistory,
  [`${statuspageSites.stripe.history}?page=1`]: stripeHistory,
  [statuspageSites.cloudflare.api]: cloudflareIncidents,
  [statuspageSites.stripe.api]: stripeIncidents,
  [googleSearchUrl]: googleSearch,
  [googleAdsUrl]: googleAds,
  [metaAdsUrl]: metaAds,
} as Record<string, unknown>

/** A fetch that answers from the recorded fixtures and 404s everything else (older history pages too). */
export const fixtureFetch: FetchLike = async (input) => {
  if (input === appleReleasesUrl) return new Response(apple.body, { headers: { "content-type": "application/rss+xml" } })
  const body = fixtures[input]
  if (body === undefined) return new Response("not recorded", { status: 404 })
  return Response.json(body)
}
