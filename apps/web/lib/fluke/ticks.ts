/** 3–5 gridlines at round values (1, 2, 2.5, 5 × 10ⁿ) covering [lo, hi]. */
export function niceTicks(lo: number, hi: number) {
  const raw = (hi - lo || Math.abs(hi) || 1) / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag
  const out = [Math.floor(lo / step) * step]
  while (out.at(-1)! < hi - step * 1e-9 || out.length < 2) out.push(Number((out.at(-1)! + step).toPrecision(12)))
  return out
}
