/**
 * Sample data for the public library and the /kit page: a DTC store doing about
 * $1.3M a week. Generated from a seeded process (trend, retail seasonality,
 * autocorrelated noise and random regime shifts), not hand-written stories,
 * so every week reads differently and nothing is staged.
 */

import type { MetricId } from "./catalog"

export interface WeekRow {
  /** Monday of the ISO week, YYYY-MM-DD */
  week: string
  values: Record<MetricId, number>
  /** Raw counts behind the rates */
  counts: {
    product_views: number
    carts: number
    checkouts: number
    repeat_orders: number
  }
  byDevice: Record<Device, { sessions: number; orders: number; revenue: number }>
  byChannel: Record<Channel, { sessions: number; orders: number; revenue: number; spend: number }>
}

export const devices = ["mobile", "desktop"] as const
export type Device = (typeof devices)[number]

export const channels = ["paid_social", "paid_search", "organic", "email", "direct"] as const
export type Channel = (typeof channels)[number]

export const channelNames: Record<Channel, string> = {
  paid_social: "Paid social",
  paid_search: "Paid search",
  organic: "Organic",
  email: "Email",
  direct: "Direct",
}

/** Small, fast, seeded PRNG so server and client render the same numbers. */
export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = () => {
    const u = Math.max(next(), 1e-9)
    const v = next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  return { next, normal }
}

const DAY = 864e5

export function isoMonday(d: Date) {
  const day = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day))
}

export function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** Thanksgiving: fourth Thursday of November. Black Friday week starts the Monday before. */
function bfcmMonday(year: number) {
  const nov1 = new Date(Date.UTC(year, 10, 1))
  const firstThu = 1 + ((4 - nov1.getUTCDay() + 7) % 7)
  const thanksgiving = new Date(Date.UTC(year, 10, firstThu + 21))
  return isoMonday(thanksgiving)
}

/** Retail seasonality for a week: [traffic multiplier, conversion multiplier]. */
function season(monday: Date): [number, number] {
  const y = monday.getUTCFullYear()
  const doy = (monday.getTime() - Date.UTC(y, 0, 1)) / DAY
  // Gentle annual wave: soft January, soft late summer, strong Q4.
  let traffic = 1 + 0.06 * Math.cos(((doy - 340) / 365) * 2 * Math.PI) - 0.04 * Math.exp(-(((doy - 15) / 18) ** 2))
  let conv = 1
  const bf = bfcmMonday(y).getTime()
  const weeksFromBf = Math.round((monday.getTime() - bf) / (7 * DAY))
  if (weeksFromBf === 0) {
    traffic *= 1.85
    conv *= 1.32
  } else if (weeksFromBf === -1) {
    traffic *= 1.12
    conv *= 0.94 // people wait for the sale
  } else if (weeksFromBf === 1) {
    traffic *= 1.3
    conv *= 1.12 // Cyber Monday week
  } else if (weeksFromBf >= 2 && weeksFromBf <= 3) {
    traffic *= 1.14
    conv *= 1.05
  } else if (weeksFromBf === 4) {
    traffic *= 0.9 // Christmas week
  }
  return [traffic, conv]
}

/** An autocorrelated driver with occasional lasting regime shifts. */
function driver(r: ReturnType<typeof rng>, n: number, sd: number, shiftProb: number, shiftSize: number) {
  const out: number[] = []
  let level = 0
  let noise = 0
  for (let i = 0; i < n; i++) {
    if (r.next() < shiftProb) level += (r.next() < 0.5 ? -1 : 1) * shiftSize * (0.5 + r.next())
    level *= 0.97 // shifts fade over months, as fixes and habits settle
    noise = 0.45 * noise + sd * r.normal()
    out.push(Math.exp(level + noise))
  }
  return out
}

export interface SampleOptions {
  seed?: number
  weeks?: number
  /** Monday of the latest complete week */
  endWeek?: string
}

export function generateStore({ seed = 20261016, weeks = 160, endWeek }: SampleOptions = {}): WeekRow[] {
  const r = rng(seed)
  const end = endWeek ? new Date(`${endWeek}T00:00:00Z`) : isoMonday(new Date(Date.now() - 7 * DAY))
  const start = new Date(end.getTime() - (weeks - 1) * 7 * DAY)

  const d = {
    traffic: driver(r, weeks, 0.035, 0.02, 0.06),
    pv: driver(r, weeks, 0.012, 0.01, 0.03),
    atc: driver(r, weeks, 0.025, 0.025, 0.06),
    cs: driver(r, weeks, 0.018, 0.02, 0.05),
    cc: driver(r, weeks, 0.015, 0.025, 0.06),
    aov: driver(r, weeks, 0.02, 0.015, 0.04),
    repeat: driver(r, weeks, 0.03, 0.01, 0.05),
    mer: driver(r, weeks, 0.05, 0.02, 0.08),
    mobileConv: driver(r, weeks, 0.03, 0.03, 0.08),
  }

  const channelShare: Record<Channel, number> = {
    paid_social: 0.28,
    paid_search: 0.18,
    organic: 0.24,
    email: 0.1,
    direct: 0.2,
  }
  const channelConv: Record<Channel, number> = {
    paid_social: 0.7,
    paid_search: 1.25,
    organic: 0.95,
    email: 1.7,
    direct: 1.15,
  }
  const channelAov: Record<Channel, number> = {
    paid_social: 0.86,
    paid_search: 1.04,
    organic: 1.0,
    email: 0.93,
    direct: 1.12,
  }
  const channelDrift = Object.fromEntries(channels.map((c) => [c, driver(r, weeks, 0.04, 0.02, 0.08)])) as Record<
    Channel,
    number[]
  >

  const rows: WeekRow[] = []
  for (let i = 0; i < weeks; i++) {
    const monday = new Date(start.getTime() + i * 7 * DAY)
    const years = (i - (weeks - 1)) / 52
    const growth = Math.exp(0.2 * years) // about 22% a year
    const [sTraffic, sConv] = season(monday)
    const at = (a: number[]) => a[i] ?? 1

    const sessions = Math.round(600_000 * growth * sTraffic * at(d.traffic))
    const pvRate = Math.min(0.9, 0.62 * at(d.pv))
    const atcRate = 0.108 * at(d.atc) * Math.sqrt(sConv)
    const csRate = Math.min(0.9, 0.52 * at(d.cs))
    // Mobile checkout quality moves completion; mobile is ~68% of sessions.
    const ccRate = Math.min(0.95, 0.64 * at(d.cc) * (0.68 * at(d.mobileConv) + 0.32) * Math.sqrt(sConv))

    const productViews = Math.round(sessions * pvRate)
    const carts = Math.round(productViews * atcRate)
    const checkouts = Math.round(carts * csRate)
    const orders = Math.round(checkouts * ccRate)
    const aov = 98 * at(d.aov) * (sConv > 1.2 ? 0.9 : 1) * Math.exp(0.03 * years)
    const revenue = orders * aov
    const repeatShare = Math.min(0.7, 0.38 * at(d.repeat) * (sConv > 1.2 ? 0.8 : 1))
    const repeatOrders = Math.round(orders * repeatShare)
    const newCustomers = orders - repeatOrders
    const mer = 3.4 * at(d.mer) * (sConv > 1.2 ? 1.25 : 1)
    const spend = revenue / mer

    // Split by device and channel, renormalized so parts add up to the totals.
    const mob = 0.68 * at(d.mobileConv)
    const mobileOrdersShare = mob / (mob + 0.32 * 1.55)
    const byDevice = {
      mobile: {
        sessions: Math.round(sessions * 0.68),
        orders: Math.round(orders * mobileOrdersShare),
        revenue: revenue * mobileOrdersShare * 0.94,
      },
      desktop: { sessions: 0, orders: 0, revenue: 0 },
    }
    byDevice.desktop = {
      sessions: sessions - byDevice.mobile.sessions,
      orders: orders - byDevice.mobile.orders,
      revenue: revenue - byDevice.mobile.revenue,
    }

    const sw = channels.map((c) => channelShare[c] * (channelDrift[c][i] ?? 1))
    const swSum = sw.reduce((a, b) => a + b, 0)
    const ow = channels.map((c, k) => (sw[k] ?? 0) * channelConv[c])
    const owSum = ow.reduce((a, b) => a + b, 0)
    const rw = channels.map((c, k) => (ow[k] ?? 0) * channelAov[c])
    const rwSum = rw.reduce((a, b) => a + b, 0)
    const paidW = { paid_social: 0.62, paid_search: 0.38 } as Record<Channel, number>
    const byChannel = Object.fromEntries(
      channels.map((c, k) => [
        c,
        {
          sessions: Math.round((sessions * (sw[k] ?? 0)) / swSum),
          orders: Math.round((orders * (ow[k] ?? 0)) / owSum),
          revenue: (revenue * (rw[k] ?? 0)) / rwSum,
          spend: spend * (paidW[c] ?? 0),
        },
      ]),
    ) as WeekRow["byChannel"]

    rows.push({
      week: fmtDate(monday),
      values: {
        sessions,
        product_view_rate: productViews / sessions,
        add_to_cart_rate: carts / productViews,
        checkout_start_rate: checkouts / carts,
        checkout_completion_rate: orders / checkouts,
        orders,
        conversion_rate: orders / sessions,
        aov: revenue / orders,
        revenue,
        new_customers: newCustomers,
        repeat_share: repeatOrders / orders,
        spend,
        mer: revenue / spend,
        ncac: spend / newCustomers,
      },
      counts: { product_views: productViews, carts, checkouts, repeat_orders: repeatOrders },
      byDevice,
      byChannel,
    })
  }
  return rows
}

/** Orders by weekday and 3-hour block for one week, for the time-of-day heatmap and radar. */
export function timeOfDay(row: WeekRow, seed = 7) {
  const r = rng(seed + row.week.split("-").reduce((a, b) => a + Number(b), 0))
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const blocks = ["00", "03", "06", "09", "12", "15", "18", "21"]
  const blockShape = [0.03, 0.015, 0.06, 0.15, 0.19, 0.17, 0.22, 0.165]
  const dayShape = [1.05, 1.02, 1, 0.98, 0.94, 0.96, 1.05]
  const cells: { day: string; block: string; orders: number }[] = []
  let total = 0
  for (const [di, day] of days.entries()) {
    for (const [bi, block] of blocks.entries()) {
      const w = (dayShape[di] ?? 1) * (blockShape[bi] ?? 0.1) * (1 + 0.08 * r.normal())
      total += w
      cells.push({ day, block, orders: w })
    }
  }
  return cells.map((c) => ({ ...c, orders: Math.round((c.orders / total) * row.values.orders) }))
}

/** Monthly cohorts: share of each first-order month that ordered again in month n. */
export function cohorts(seed = 11, months = 12, endWeek?: string) {
  const r = rng(seed)
  const end = endWeek ? new Date(`${endWeek}T00:00:00Z`) : new Date()
  const out: { cohort: string; size: number; retention: (number | null)[] }[] = []
  for (let m = months - 1; m >= 0; m--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - m - 1, 1))
    const label = d.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
    const quality = 1 + 0.08 * r.normal() + (d.getUTCMonth() === 10 ? -0.12 : 0) // BFCM cohorts repeat less
    const retention: (number | null)[] = []
    for (let n = 0; n < months; n++) {
      if (n > m) {
        retention.push(null)
        continue
      }
      const base = n === 0 ? 1 : 0.32 * Math.pow(n, -0.45) * quality * (1 + 0.04 * r.normal())
      retention.push(Math.max(0, Math.min(1, base)))
    }
    out.push({ cohort: label, size: Math.round(32000 * (1 + 0.1 * r.normal())), retention })
  }
  return out
}

/** Recent experiments with their effect estimate and 95% interval, in relative lift. */
export function experiments(seed = 5) {
  const r = rng(seed)
  const names = [
    "One-page checkout",
    "Free shipping bar",
    "Bundle offer on PDP",
    "Shorter signup form",
    "Reviews above the fold",
    "Exit-intent discount",
  ]
  return names.map((name) => {
    const lift = 0.035 * r.normal()
    const half = 0.015 + 0.025 * r.next()
    return { name, lift, lo: lift - half, hi: lift + half, users: Math.round(40000 + 120000 * r.next()) }
  })
}
