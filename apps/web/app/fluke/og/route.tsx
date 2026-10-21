import { ImageResponse } from "next/og"
import { flukeTest, formatFluke, type FlukeUnit } from "@workspace/metrics"

/** The share card for a Fluke Test result: the verdict in Geist Pixel, the numbers in Mono. */

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

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const values = (q.get("v") ?? "").split(",").map(Number).filter(Number.isFinite).slice(0, 160)
  const unit: FlukeUnit = q.get("u") === "usd" ? "$" : q.get("u") === "pct" ? "%" : ""
  const name = (q.get("m") ?? "").slice(0, 60)
  const res = flukeTest(values)
  const headline = res ? `${name || "Last week"}: ${res.verdict}` : "Is this a fluke?"
  const meta = res
    ? `${formatFluke(res.last, unit)} last week · ${Math.abs(res.zChange).toFixed(1)}× the normal swing · normal ${formatFluke(res.range[0], unit)} – ${formatFluke(res.range[1], unit)}`
    : "Paste a weekly number. See if last week's move is real."
  const tone = res && (res.call === "real" || res.call === "building") ? (res.zLevel > 0 ? "#166534" : "#DC2626") : "#18181B"
  const [pixel, mono] = await Promise.all([googleFont("Geist+Pixel", `▲wowyoy${headline}`), googleFont("Geist+Mono", `THE FLUKE TEST${meta}wowyoy.com/fluke`)])
  const fonts = [
    ...(pixel ? [{ name: "Pixel", data: pixel, style: "normal" as const, weight: 400 as const }] : []),
    ...(mono ? [{ name: "Mono", data: mono, style: "normal" as const, weight: 400 as const }] : []),
  ]
  const strip = values.slice(-26)
  const lo = Math.min(...strip)
  const hi = Math.max(...strip)

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#FAFAF9", color: "#18181B", padding: 72 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontFamily: "Pixel", fontSize: 40 }}>
            <span style={{ color: "#166534" }}>▲</span>
            <span style={{ marginLeft: 12 }}>wowyoy</span>
          </div>
          <div style={{ fontFamily: "Mono", fontSize: 22, letterSpacing: 2, color: "#63636B" }}>THE FLUKE TEST</div>
        </div>
        <div style={{ display: "flex", fontFamily: "Pixel", fontSize: 79, lineHeight: 1.05, maxWidth: 1000 }}>{headline}</div>
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
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Mono", fontSize: 24, color: "#63636B" }}>
          <span>{meta}</span>
          <span>wowyoy.com/fluke</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: fonts.length ? fonts : undefined },
  )
}
