import type { BadgeRead, Direction } from "@workspace/feeds/github/read"
import { glyphMetrics, glyphs } from "./badge-glyphs"

/**
 * The README badge as a self-contained SVG: Geist Mono drawn as outlines (an <img> can't load
 * fonts), the arrow drawn as pixel squares in the direction colour, and a filled pill only for a real move.
 */

export const badgeSizes = ["sm", "md", "lg"] as const
export type BadgeSize = (typeof badgeSizes)[number]
export const badgeThemes = ["light", "dark"] as const
export type BadgeTheme = (typeof badgeThemes)[number]

/** Height, font size, side padding, corner radius and arrow cell size, in whole pixels. */
const sizes: Record<BadgeSize, { h: number; font: number; pad: number; radius: number; cell: number }> = {
  sm: { h: 20, font: 11, pad: 7, radius: 4, cell: 2 },
  md: { h: 28, font: 14, pad: 10, radius: 6, cell: 2 },
  lg: { h: 40, font: 19, pad: 14, radius: 8, cell: 3 },
}

const palette = {
  light: {
    labelBg: "#18181B",
    labelInk: "#FAFAF9",
    bg: "#FFFFFF",
    edge: "#E5E5E3",
    muted: "#63636B",
    up: "#166534",
    down: "#DC2626",
    upBg: "#DCFCE7",
    downBg: "#FEE4E2",
  },
  dark: {
    labelBg: "#F4F4F5",
    labelInk: "#0A0A0B",
    bg: "#141416",
    edge: "#27272A",
    muted: "#A1A1AA",
    up: "#4ADE80",
    down: "#F04848",
    // The dark tints at 50% over the surface, flattened so they read the same on any page.
    upBg: "#143321",
    downBg: "#491819",
  },
} as const

/** Pixel arrows, row by row (# = filled cell). */
const arrows: Record<Exclude<Direction, "flat">, string[]> = {
  up: ["..#..", ".###.", "#####"],
  down: ["#####", ".###.", "..#.."],
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Characters the baked glyph set doesn't have are drawn as spaces. */
function textWidth(text: string, font: number) {
  return (text.length * glyphs[400].advance * font) / glyphMetrics.unitsPerEm
}

function run(text: string, x: number, baseline: number, font: number, weight: 400 | 500, fill: string, used: Set<string>) {
  const set = glyphs[weight]
  const s = font / glyphMetrics.unitsPerEm
  const uses: string[] = []
  ;[...text].forEach((ch, i) => {
    if (!set.paths[ch]) return
    const id = `${weight}-${ch.codePointAt(0)!.toString(16)}`
    used.add(`${weight}:${ch}`)
    uses.push(`<use href="#g${id}" x="${i * set.advance}"/>`)
  })
  return `<g fill="${fill}" transform="translate(${round(x)} ${baseline}) scale(${round(s, 5)})">${uses.join("")}</g>`
}

const round = (n: number, d = 2) => Number(n.toFixed(d))

export interface BadgeOptions {
  theme?: BadgeTheme
  size?: BadgeSize
}

export function renderBadge(read: Pick<BadgeRead, "label" | "value" | "dir" | "tone">, opts: BadgeOptions = {}) {
  const t = sizes[opts.size ?? "sm"]
  const c = palette[opts.theme ?? "light"]
  const used = new Set<string>()
  // Optical centre: halfway between the x-height and the cap height sits on the badge's midline.
  const baseline = Math.round(t.h / 2 + ((glyphMetrics.xHeight + glyphMetrics.capHeight) / 4 / glyphMetrics.unitsPerEm) * t.font)

  const labelW = Math.round(t.pad * 2 + textWidth(read.label, t.font))
  const arrowRows = read.dir && read.dir !== "flat" ? arrows[read.dir] : null
  const arrowW = arrowRows ? arrowRows[0]!.length * t.cell : 0
  const gap = arrowRows ? Math.round(t.font * 0.4) : 0
  const valueW = Math.round(t.pad * 2 + arrowW + gap + textWidth(read.value, t.font))
  const w = labelW + valueW

  const tone = read.dir === "up" ? c.up : read.dir === "down" ? c.down : c.muted
  const textFill = read.tone !== "muted" && (read.dir === "up" || read.dir === "down") ? tone : c.muted
  const valueBg = read.tone === "real" ? (read.dir === "down" ? c.downBg : c.upBg) : c.bg

  let arrow = ""
  if (arrowRows) {
    const rows = arrowRows.length
    const x0 = labelW + t.pad
    // The arrow stands on the baseline and is as tall as the x-height, give or take a cell.
    const y0 = baseline - rows * t.cell
    const cells: string[] = []
    arrowRows.forEach((row, ry) => {
      ;[...row].forEach((ch, rx) => {
        if (ch === "#") cells.push(`<rect x="${x0 + rx * t.cell}" y="${y0 + ry * t.cell}" width="${t.cell}" height="${t.cell}"/>`)
      })
    })
    arrow = `<g fill="${read.tone === "muted" ? c.muted : tone}" shape-rendering="crispEdges">${cells.join("")}</g>`
  }

  const label = run(read.label, t.pad, baseline, t.font, 400, c.labelInk, used)
  const value = run(read.value, labelW + t.pad + arrowW + gap, baseline, t.font, read.tone === "real" ? 500 : 400, textFill, used)
  const defs = [...used]
    .map((k) => {
      const [weight, ch] = [Number(k.slice(0, 3)) as 400 | 500, k.slice(4)]
      return `<path id="g${weight}-${ch.codePointAt(0)!.toString(16)}" d="${glyphs[weight].paths[ch]}"/>`
    })
    .join("")

  const title = `${read.label}: ${read.dir === "up" ? "up " : read.dir === "down" ? "down " : ""}${read.value.replace("WoW", "week over week")}`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${t.h}" viewBox="0 0 ${w} ${t.h}" role="img" aria-label="${xml(title)}">`,
    `<title>${xml(title)} · wowyoy Repo Pulse</title>`,
    `<defs>${defs}<clipPath id="r"><rect width="${w}" height="${t.h}" rx="${t.radius}"/></clipPath></defs>`,
    `<g clip-path="url(#r)" shape-rendering="crispEdges"><rect width="${labelW}" height="${t.h}" fill="${c.labelBg}"/><rect x="${labelW}" width="${valueW}" height="${t.h}" fill="${valueBg}"/></g>`,
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${t.h - 1}" rx="${t.radius - 0.5}" fill="none" stroke="${read.tone === "real" ? valueBg : c.edge}"/>`,
    `<rect width="${labelW}" height="${t.h}" fill="${c.labelBg}" clip-path="url(#r)" shape-rendering="crispEdges"/>`,
    label,
    arrow,
    value,
    `</svg>`,
  ].join("")
}
