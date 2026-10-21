import { rng } from "./sample"
import { isoWeekOf, latestClosedWeek, movingEvents } from "./clock"
import type { MetricSpec } from "./spec"

/**
 * Example data for the public pages: three fictional businesses, labelled as examples
 * wherever they render. Each spec's series comes from a seeded process (trend, the
 * business's seasonality, autocorrelated drift with rare lasting shifts, and sampling
 * noise of the spec's own type at its own volume), so every page reads differently
 * and none is a staged story. Same spec + same end week = same numbers, on server and client.
 */

export const exampleBusinesses = {
  store: { name: "Northwind Goods", what: "a DTC store" },
  saas: { name: "Copperline", what: "a B2B SaaS" },
  app: { name: "Pocketful", what: "a consumer app" },
} as const
export type ExampleBusiness = keyof typeof exampleBusinesses

export interface ExamplePoint {
  /** Monday, YYYY-MM-DD */
  week: string
  value: number
  /** The unit count behind the value (denominator for rates, events for counts). */
  volume: number
}

const DAY = 864e5

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** [volume multiplier, rate multiplier] for a week of a business. */
function season(business: ExampleBusiness, monday: string): [number, number] {
  const t = Date.parse(`${monday}T00:00:00Z`)
  const y = new Date(t).getUTCFullYear()
  const doy = (t - Date.UTC(y, 0, 1)) / DAY
  const inWeek = (id: string) => {
    const e = [...movingEvents(y), ...movingEvents(y + 1)].find((x) => x.id === id && isoWeekOf(x.date).monday === monday)
    return !!e
  }
  const christmas = doy >= 357 || doy < 2
  switch (business) {
    case "store": {
      let v = 1 + 0.06 * Math.cos(((doy - 340) / 365) * 2 * Math.PI) - 0.04 * Math.exp(-(((doy - 15) / 18) ** 2))
      let r = 1
      if (inWeek("black-friday")) [v, r] = [v * 1.8, 1.3]
      else if (inWeek("cyber-monday")) [v, r] = [v * 1.28, 1.1]
      else if (christmas) v *= 0.9
      else if (inWeek("prime-day")) v *= 1.06
      return [v, r]
    }
    case "saas": {
      if (christmas) return [0.62, 0.92]
      const august = doy > 212 && doy < 243
      return [(august ? 0.92 : 1) * (1 + 0.03 * Math.cos(((doy - 270) / 365) * 2 * Math.PI)), 1]
    }
    case "app": {
      const jan = Math.exp(-(((doy - 10) / 14) ** 2))
      return [1 + 0.08 * jan - 0.03 * Math.cos(((doy - 20) / 365) * 2 * Math.PI) + (christmas ? 0.1 : 0), 1 + 0.02 * jan]
    }
  }
}

/** Autocorrelated multiplicative drift with occasional shifts that fade over months. */
function drift(r: ReturnType<typeof rng>, n: number, sd: number, shiftProb: number, shiftSize: number) {
  const out: number[] = []
  let level = 0
  let noise = 0
  for (let i = 0; i < n; i++) {
    if (r.next() < shiftProb) level += (r.next() < 0.5 ? -1 : 1) * shiftSize * (0.5 + r.next())
    level *= 0.96
    noise = 0.5 * noise + sd * r.normal()
    out.push(Math.exp(level + noise))
  }
  return out
}

export interface ExampleOptions {
  weeks?: number
  /** Monday of the last week. Defaults to the latest closed week. */
  end?: string
}

export function exampleSeries(
  spec: Pick<MetricSpec, "id" | "kind" | "noise" | "example">,
  { weeks = 104, end }: ExampleOptions = {},
): ExamplePoint[] {
  const r = rng(hash(spec.id))
  const endMonday = end ?? latestClosedWeek().monday
  const endT = Date.parse(`${endMonday}T00:00:00Z`)
  const { business, level, volume, trend, season: seasonality } = spec.example
  const { type, cv = 1 } = spec.noise
  const volDrift = drift(r, weeks, 0.03, 0.02, 0.05)
  const valDrift = drift(r, weeks, type === "process" ? 0.01 : 0.015, 0.025, 0.06)
  const out: ExamplePoint[] = []

  for (let i = 0; i < weeks; i++) {
    const monday = new Date(endT - (weeks - 1 - i) * 7 * DAY).toISOString().slice(0, 10)
    const years = (i - (weeks - 1)) / 52
    const growth = Math.exp(trend * years)
    const [sv, lift] = season(business, monday)
    const sr = lift ** seasonality
    const vol = Math.max(1, volume * growth * sv * (volDrift[i] ?? 1))
    const d = valDrift[i] ?? 1
    let value: number
    let units = vol
    switch (type) {
      case "binomial": {
        const p = Math.min(0.995, Math.max(0.0005, level * d * sr))
        value = p + Math.sqrt((p * (1 - p)) / vol) * r.normal()
        value = Math.min(0.999, Math.max(0, value))
        break
      }
      case "poisson": {
        // A count is its own volume: the level already scales with growth and season.
        const lambda = Math.max(1, level * growth * sv * d)
        value = Math.max(0, Math.round(lambda + Math.sqrt(lambda) * r.normal()))
        units = Math.max(1, value)
        break
      }
      case "compound": {
        // Lognormal with the compound sum's relative spread, so small weeks stay positive and skew right.
        const total = level * growth * sv * d * sr
        const rel = Math.sqrt((1 + cv * cv) / vol)
        const s2 = Math.log(1 + rel * rel)
        value = total * Math.exp(Math.sqrt(s2) * r.normal() - s2 / 2)
        break
      }
      case "mean": {
        const m = level * d * (sr > 1.15 ? 0.94 : 1) * Math.exp(0.3 * trend * years)
        value = Math.max(0, m * (1 + (cv / Math.sqrt(vol)) * r.normal()))
        break
      }
      case "process": {
        value = level * Math.exp(trend * years) * d * (spec.kind === "rate" || spec.kind === "ratio" ? Math.sqrt(sr) : sv ** 0.25)
        break
      }
    }
    out.push({ week: monday, value, volume: Math.round(units) })
  }
  return out
}
