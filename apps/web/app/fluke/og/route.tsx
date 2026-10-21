import { ImageResponse } from "next/og"
import { MINUS, flukeTest, formatFluke, type FlukeUnit } from "@workspace/metrics"
import { formatTwoWeekValue, kindInfo, parseTwoWeekPath, runTwoWeek, type TwoWeekReport } from "@/lib/fluke/two-week"

/**
 * The share card for a Fluke Test result: the verdict in Geist Pixel, the numbers in Mono.
 * History: ?m=Orders&v=10,11,...&u=pct. Two numbers: ?t=rate/800/4.1/3.6 (the share path after /fluke).
 */

const INK = "#18181B"
const MUTED = "#63636B"
const BAND = "#E6E6E1"
const UP = "#166534"
const DOWN = "#DC2626"

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

async function fonts(pixelText: string, monoText: string) {
  const [pixel, mono] = await Promise.all([
    googleFont("Geist+Pixel", `▲wowyoy${pixelText}`),
    googleFont("Geist+Mono", `THE FLUKE TEST${monoText}wowyoy.com/fluke`),
  ])
  const out = [
    ...(pixel ? [{ name: "Pixel", data: pixel, style: "normal" as const, weight: 400 as const }] : []),
    ...(mono ? [{ name: "Mono", data: mono, style: "normal" as const, weight: 400 as const }] : []),
  ]
  return out.length ? out : undefined
}

function Frame({ headline, children, meta }: { headline: string; children: React.ReactNode; meta: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#FAFAF9",
        color: INK,
        padding: 72,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontFamily: "Pixel", fontSize: 40 }}>
          <span style={{ color: UP }}>▲</span>
          <span style={{ marginLeft: 12 }}>wowyoy</span>
        </div>
        <div style={{ fontFamily: "Mono", fontSize: 22, letterSpacing: 2, color: MUTED }}>THE FLUKE TEST</div>
      </div>
      <div style={{ display: "flex", fontFamily: "Pixel", fontSize: 79, lineHeight: 1.05, maxWidth: 1000 }}>{headline}</div>
      {children}
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Mono", fontSize: 24, color: MUTED }}>
        <span>{meta}</span>
        <span>wowyoy.com/fluke</span>
      </div>
    </div>
  )
}

/** The change on a track: grey is the ± chance floor around zero, the marker is this move. */
function twoWeekCard(r: TwoWeekReport) {
  const { kind, before, after, volume } = r.values
  const rate = kind === "rate"
  const move = rate ? r.change.absolute : r.change.relative
  const floor = r.floor ? (rate ? r.floor.absolute : r.floor.relative) : 0
  const reach = Math.max(Math.abs(move), floor, 1e-9) * 1.35
  const at = (x: number) => `${50 + (x / reach) * 50}%`
  const tone = r.significant ? (r.direction === "up" ? UP : DOWN) : INK
  const sign = move > 0 ? "+" : move < 0 ? MINUS : ""
  const nums = `${formatTwoWeekValue(kind, before)} → ${formatTwoWeekValue(kind, after)}`
  const meta = [
    kindInfo[kind].label.toLowerCase(),
    volume ? `${volume.toLocaleString("en-US")} a week` : null,
    r.floor ? `chance ${r.floor.label}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const changeText = `${sign}${r.change.label}`
  const node = (
    <Frame headline={r.headline} meta={meta}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 24, fontFamily: "Mono" }}>
          <span style={{ fontSize: 40 }}>{nums}</span>
          <span style={{ fontSize: 30, color: tone }}>{changeText}</span>
        </div>
        <div
          style={{
            display: "flex",
            position: "relative",
            height: 28,
            background: "#FFFFFF",
            border: "1px solid #E5E5E3",
            borderRadius: 14,
          }}
        >
          {r.floor ? (
            <div
              style={{
                position: "absolute",
                left: at(-floor),
                width: `${(floor / reach) * 100}%`,
                top: 3,
                bottom: 3,
                background: BAND,
                borderRadius: 11,
                display: "flex",
              }}
            />
          ) : null}
          <div style={{ position: "absolute", left: "50%", top: -6, bottom: -6, width: 2, background: "#C4C4C0", display: "flex" }} />
          <div
            style={{
              position: "absolute",
              left: at(move),
              top: 0,
              width: 24,
              height: 24,
              marginLeft: -12,
              borderRadius: 12,
              background: tone,
              border: "3px solid #FAFAF9",
              display: "flex",
            }}
          />
        </div>
      </div>
    </Frame>
  )
  return { node, pixelText: r.headline, monoText: `${nums}${changeText}${meta}` }
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const t = q.get("t")
  if (t) {
    const values = parseTwoWeekPath(t.split("/"), q.get("cv"))
    const r = values ? runTwoWeek(values) : null
    if (r && !("error" in r)) {
      const card = twoWeekCard(r)
      return new ImageResponse(card.node, { width: 1200, height: 630, fonts: await fonts(card.pixelText, card.monoText) })
    }
  }

  const values = (q.get("v") ?? "").split(",").map(Number).filter(Number.isFinite).slice(0, 160)
  const unit: FlukeUnit = q.get("u") === "usd" ? "$" : q.get("u") === "pct" ? "%" : ""
  const name = (q.get("m") ?? "").slice(0, 60)
  const res = flukeTest(values)
  const headline = res ? `${name || "Last week"}: ${res.verdict}` : "Is this a fluke?"
  const meta = res
    ? `${formatFluke(res.last, unit)} last week · ${Math.abs(res.zChange).toFixed(1)}× the normal swing · normal ${formatFluke(res.range[0], unit)} – ${formatFluke(res.range[1], unit)}`
    : "Paste a weekly number. See if last week's move is real."
  const tone = res && (res.call === "real" || res.call === "building") ? (res.zLevel > 0 ? UP : DOWN) : INK
  const strip = values.slice(-26)
  const lo = Math.min(...strip)
  const hi = Math.max(...strip)

  return new ImageResponse(
    <Frame headline={headline} meta={meta}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 64 }}>
        {strip.map((v, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${hi > lo ? 20 + ((v - lo) / (hi - lo)) * 80 : 50}%`,
              background: i === strip.length - 1 ? tone : "#D4D4D0",
              borderRadius: 3,
            }}
          />
        ))}
      </div>
    </Frame>,
    { width: 1200, height: 630, fonts: await fonts(headline, meta) },
  )
}
