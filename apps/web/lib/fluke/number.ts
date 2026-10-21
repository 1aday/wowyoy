/**
 * Read one number the way people type it: "4.1%", "1,184", "$412k", "1.3M", "4,1". Returns null for anything else.
 * Thousands separators only count in groups of three; a lone comma before one or two digits is a decimal comma.
 */
export function parseNumber(text: string | number): number | null {
  if (typeof text === "number") return Number.isFinite(text) ? text : null
  const s = text
    .trim()
    .replace(/[\s $€£]/g, "")
    .replace(/^[−–]/, "-")
    .replace(/%$/, "")
  const m = /^([-+]?)([\d.,]+)([kKmMbB]?)$/.exec(s)
  if (!m) return null
  let digits = m[2]!
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(digits)) digits = digits.replace(/,/g, "")
  else if (/^\d+,\d{1,2}$/.test(digits)) digits = digits.replace(",", ".")
  if (!/^(\d+\.?\d*|\.\d+)$/.test(digits)) return null
  const scale = { "": 1, k: 1e3, m: 1e6, b: 1e9 }[m[3]!.toLowerCase() as "" | "k" | "m" | "b"]
  const v = Number.parseFloat(digits) * scale
  if (!Number.isFinite(v)) return null
  return m[1] === "-" ? -v : v
}

/** A number as a URL path segment: plain decimal, no exponent, no trailing zeros. */
export function segment(v: number) {
  return String(Number(v.toFixed(6)))
}
