import { ImageResponse } from "next/og"
import { directionOf, headlineText, latestCalls, realMoves, repoHeadline, type HeadlinePart } from "@workspace/feeds/github/read"
import { getRepoPulse } from "@/lib/gh/data"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Repo Pulse: this week's call for the repo"

/** The share card: the week's answer in Geist Pixel, the measure behind it as 13 weekly columns. */

async function googleFont(family: string, text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`)).text()
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1]
    if (!url) return null
    return await (await fetch(url)).arrayBuffer()
  } catch {
    return null
  }
}

const INK = "#18181B"
const MUTED = "#63636B"

/** The image lays out words, not text runs: split the headline into words, each keeping its parts' colours. */
function words(parts: readonly HeadlinePart[]) {
  const out: HeadlinePart[][] = [[]]
  for (const p of parts) {
    for (const t of p.text.split(/( )/)) {
      if (t === " ") out.push([])
      else if (t) out.at(-1)!.push({ text: t, tone: p.tone })
    }
  }
  return out.filter((w) => w.length)
}

export default async function Image({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params
  const res = await getRepoPulse(owner, repo)
  const name = res.status === "ok" ? res.pulse.repo.fullName : `${owner}/${repo}`
  const parts: HeadlinePart[] = res.status === "ok" ? repoHeadline(res.pulse) : [{ text: "Is your repo's week real?" }]
  const headline = headlineText(parts)
  const top = res.status === "ok" ? realMoves(latestCalls(res.pulse))[0] : undefined
  const measure = res.status === "ok" ? (res.pulse.measures.find((m) => m.measure === top?.measure) ?? res.pulse.measures.find((m) => m.status !== "unavailable")) : undefined
  const closed = res.status === "ok" ? res.pulse.closed : 0
  const strip = measure ? measure.counts.slice(Math.max(0, closed - 13), closed) : []
  const values = strip.filter((v): v is number => v != null)
  const lo = Math.min(...values, 0)
  const hi = Math.max(...values, 1)
  const tone = top ? (directionOf(top.verdict) === "down" ? "#DC2626" : "#166534") : INK
  const week = res.status === "ok" ? res.pulse.weeks[closed - 1]!.id : ""
  const meta = `${name}${week ? ` · ${week}` : ""}`

  const [pixel, mono] = await Promise.all([googleFont("Geist+Pixel", `▲wowyoy${headline}`), googleFont("Geist+Mono", `REPO PULSE${meta}wowyoy.com/gh${measure?.measure ?? ""}`)])
  const fonts = [
    ...(pixel ? [{ name: "Pixel", data: pixel, style: "normal" as const, weight: 400 as const }] : []),
    ...(mono ? [{ name: "Mono", data: mono, style: "normal" as const, weight: 400 as const }] : []),
  ]

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#FAFAF9", color: INK, padding: 72 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontFamily: "Pixel", fontSize: 40 }}>
            <span style={{ color: "#166534" }}>▲</span>
            <span style={{ marginLeft: 12 }}>wowyoy</span>
          </div>
          <div style={{ fontFamily: "Mono", fontSize: 22, letterSpacing: 2, color: MUTED }}>REPO PULSE</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 26, fontFamily: "Pixel", fontSize: 79, lineHeight: 1.05, maxWidth: 1050 }}>
          {words(parts).map((w, i) => (
            <div key={i} style={{ display: "flex" }}>
              {w.map((seg, k) => (
                <span key={k} style={{ color: seg.tone === "up" ? "#166534" : seg.tone === "down" ? "#DC2626" : INK }}>
                  {seg.text}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 72 }}>
          {strip.map((v, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: v == null ? 4 : `${Math.max(6, ((v - lo) / (hi - lo || 1)) * 100)}%`,
                background: i === strip.length - 1 ? tone : "#D4D4D0",
                borderRadius: 4,
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Mono", fontSize: 24, color: MUTED }}>
          <span>{meta}</span>
          <span>wowyoy.com/gh</span>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  )
}
