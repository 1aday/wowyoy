/**
 * A best-effort token bucket per client IP. It lives in this server instance's memory, so each
 * instance (and each cold start) counts separately: it slows down a loop, it is not a quota.
 */
export class TokenBuckets {
  private buckets = new Map<string, { tokens: number; at: number }>()

  constructor(
    readonly capacity = 60,
    /** Tokens added per second. */
    readonly refill = 1,
    private readonly maxKeys = 10_000,
  ) {}

  /** Take one token. Returns 0 when allowed, else the seconds to wait. */
  take(key: string, now = Date.now()): number {
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now }
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.refill)
    b.at = now
    if (b.tokens < 1) {
      this.buckets.set(key, b)
      return Math.ceil((1 - b.tokens) / this.refill)
    }
    b.tokens -= 1
    this.buckets.set(key, b)
    if (this.buckets.size > this.maxKeys) this.prune(now)
    return 0
  }

  private prune(now: number) {
    for (const [k, b] of this.buckets) {
      if (b.tokens + ((now - b.at) / 1000) * this.refill >= this.capacity) this.buckets.delete(k)
    }
    // Still full of active clients: drop the oldest entries rather than grow without bound.
    for (const k of this.buckets.keys()) {
      if (this.buckets.size <= this.maxKeys) break
      this.buckets.delete(k)
    }
  }
}

/** The client's IP as the platform reports it: the first x-forwarded-for hop, then x-real-ip. */
export function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown"
}
