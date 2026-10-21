import { ImageResponse } from "next/og"
import { parseWeekId } from "@workspace/metrics"
import { weekState } from "@/lib/ledger/archive"
import { weekRange } from "@/lib/ledger/format"
import { ledgerWeek } from "@/lib/ledger/week"

/** The share card for a week: the headline in Geist Pixel, the week's seven days as a strip, the rest in Mono. */

export const alt = "Monday Ledger week card"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const revalidate = 86400

export function generateStaticParams() {
  return []
}

async function googleFont(family: string, text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`, { cache: "force-cache" })).text()
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1]
    if (!url) return null
    return await (await fetch(url, { cache: "force-cache" })).arrayBuffer()
  } catch {
    return null
  }
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"]
const ink = "#18181B"
const muted = "#63636B"

export default async function Image({ params }: { params: Promise<{ week: string }> }) {
  const week = parseWeekId((await params).week)
  const ledger = week && weekState(week) === "closed" ? await ledgerWeek(week) : null
  const headline = ledger?.headline ?? "The Monday Ledger"
  const label = week ? `MONDAY LEDGER · ${week.id.toUpperCase()}` : "MONDAY LEDGER"
  const answered = ledger ? ledger.feeds.filter((f) => f.status === "ok").length : 0
  const meta = week && ledger ? `${weekRange(week)} · ${answered} of ${ledger.feeds.length} feeds answered` : "One page per closed week"
  const url = `wowyoy.com/w${week ? `/${week.id}` : ""}`

  // Each day: ink when an outside event above minor touched it, grey for a calendar day, an outline otherwise.
  const days = week
    ? DAYS.map((d, i) => {
        const date = new Date(Date.parse(`${week.monday}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10)
        const world = ledger?.world.some((g) => g.events.some((e) => e.date <= date && (e.end ?? e.date) >= date)) ?? false
        const calendar = ledger?.calendar.some((r) => r.date === date) ?? false
        return { d, world, calendar }
      })
    : []

  const [pixel, mono] = await Promise.all([googleFont("Geist+Pixel", `▲wowyoy${headline}`), googleFont("Geist+Mono", `${label}${meta}${url}${DAYS.join("")}`)])
  const fonts = [
    ...(pixel ? [{ name: "Pixel", data: pixel, style: "normal" as const, weight: 400 as const }] : []),
    ...(mono ? [{ name: "Mono", data: mono, style: "normal" as const, weight: 400 as const }] : []),
  ]

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#FAFAF9", color: ink, padding: 72 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontFamily: "Pixel", fontSize: 40 }}>
            <span style={{ color: "#166534" }}>▲</span>
            <span style={{ marginLeft: 12 }}>wowyoy</span>
          </div>
          <div style={{ fontFamily: "Mono", fontSize: 22, letterSpacing: 2, color: muted }}>{label}</div>
        </div>
        <div style={{ display: "flex", fontFamily: "Pixel", fontSize: headline.length > 40 ? 46 : 79, lineHeight: 1.08, maxWidth: 1056 }}>{headline}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {days.length > 0 && (
            <div style={{ display: "flex", gap: 10 }}>
              {days.map((x, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  <div
                    style={{
                      height: 14,
                      borderRadius: 4,
                      background: x.world ? ink : x.calendar ? "#D4D4D0" : "transparent",
                      border: x.world || x.calendar ? "none" : "2px solid #E5E5E3",
                    }}
                  />
                  <span style={{ fontFamily: "Mono", fontSize: 18, color: muted }}>{x.d}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Mono", fontSize: 24, color: muted }}>
            <span>{meta}</span>
            <span>{url}</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  )
}
