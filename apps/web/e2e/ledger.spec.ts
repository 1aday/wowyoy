import { expect, test, type Page } from "@playwright/test"

/**
 * The Monday Ledger, read from recorded feeds (the web server runs with WOWYOY_FEED_FIXTURES=1):
 * Statuspage history only for Aug–Oct 2026, Google and Meta for their windows, Apple from May 2026.
 */

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(String(e)))
  // Prefetches of other sections are not this page's errors.
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()))
  return errors
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

test.describe("monday ledger", () => {
  test("the index leads with the latest closed week and lists the archive", async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto("/w")
    const h1 = page.locator("h1")
    await expect(h1).toContainText(/Monday Ledger · Week \d+/)
    await expect(h1.getByRole("link")).toHaveText(/\.$/)
    const archive = page.getByRole("region", { name: "Archive" })
    await expect(archive.getByRole("link", { name: /^Black Friday and Thanksgiving in the US/ })).toBeVisible()
    await expect(page.getByRole("region", { name: "Calendar" })).toBeVisible()
    await noSideScroll(page)
    expect(errors).toEqual([])
  })

  test("a Black Friday week: calendar rows, the YoY base and a feed that can't reach back", async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto("/w/2025-w48")
    await expect(page.locator("h1")).toHaveText("Black Friday and Thanksgiving in the US.")
    await expect(page).toHaveTitle(/^Week 48, 2025: Black Friday/)
    const calendar = page.getByRole("region", { name: "Calendar" })
    await expect(calendar.getByRole("row", { name: /Black Friday/ })).toContainText("Fri Nov 28")
    await expect(calendar.getByRole("row", { name: /^Thu Nov 27 Thanksgiving/ })).toContainText("US")
    await expect(calendar).toContainText("2024-w48")
    const world = page.getByRole("region", { name: "World" })
    await expect(world.getByText("Feed unavailable")).toHaveCount(3)
    await expect(world).toContainText(/Its public history starts \w+ \d+, 2026, after this week/)
    await noSideScroll(page)
    expect(errors).toEqual([])
  })

  test("a week with a critical Cloudflare incident links the source and the metrics it can move", async ({ page }) => {
    await page.goto("/w/2026-w40")
    await expect(page.locator("h1")).toHaveText(/^Cloudflare had a critical incident on Friday; Google's September 2026 spam update was rolling out\.$/)
    const world = page.getByRole("region", { name: "World" })
    const incident = world.getByRole("link", { name: "Cloudflare CDN experiencing increase in errors." })
    await expect(incident).toHaveAttribute("href", "https://www.cloudflarestatus.com/incidents/2xnmsnv8yv5x")
    await expect(world).toContainText("Can move Sessions")
    await expect(world).toContainText("critical")
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
    await noSideScroll(page)
  })

  test("prev and next step through closed weeks, by link and by key", async ({ page, isMobile }) => {
    await page.goto("/w/2026-w40")
    await page.getByRole("navigation", { name: "Weeks" }).first().getByRole("link", { name: "2026-w41" }).click()
    await expect(page).toHaveURL(/\/w\/2026-w41$/)
    if (!isMobile) {
      await page.keyboard.press("[")
      await expect(page).toHaveURL(/\/w\/2026-w40$/)
    }
  })

  test("only closed weeks inside the archive have pages", async ({ page, request }) => {
    expect((await request.get("/w/2025-w44")).status()).toBe(404)
    expect((await request.get("/w/2099-w10")).status()).toBe(404)
    expect((await request.get("/w/2026-w99")).status()).toBe(404)
    const upper = await request.get("/w/2025-W48", { maxRedirects: 0 })
    expect(upper.status()).toBe(308)
    expect(upper.headers()["location"]).toMatch(/\/w\/2025-w48$/)

    // The current week explains when it closes instead of showing half a week.
    await page.goto("/w")
    const latest = await page.locator("h1 a").getAttribute("href")
    const [year, week] = latest!.replace("/w/", "").split("-w").map(Number)
    const current = `${year}-w${String(week! + 1).padStart(2, "0")}`
    const res = await page.goto(`/w/${current}`)
    if (res?.status() === 200) await expect(page.locator("h1")).toContainText("closes Monday at 06:00 UTC")
  })

  test("RSS lists every closed week", async ({ request }) => {
    const res = await request.get("/w/rss.xml")
    expect(res.headers()["content-type"]).toContain("application/rss+xml")
    const xml = await res.text()
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/)
    expect(xml).toContain("<link>https://wowyoy.com/w/2025-w48</link>")
    expect(xml).toContain("<pubDate>Mon, 01 Dec 2025 06:00:00 GMT</pubDate>")
    expect((xml.match(/<item>/g) ?? []).length).toBeGreaterThanOrEqual(50)
  })

  test("the .md twin carries the same rows and a canonical link", async ({ request }) => {
    const res = await request.get("/w/2026-w40.md")
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toContain("text/markdown")
    expect(res.headers()["link"]).toBe('<https://wowyoy.com/w/2026-w40>; rel="canonical"')
    const md = await res.text()
    expect(md).toMatch(/^# Week 40, 2026: Cloudflare had a critical incident on Friday/)
    expect(md).toContain("[Cloudflare CDN experiencing increase in errors.](https://www.cloudflarestatus.com/incidents/2xnmsnv8yv5x)")
    expect((await request.get("/w/2099-w10.md")).status()).toBe(404)
  })

  test("each week has an og card", async ({ page, request }) => {
    await page.goto("/w/2026-w40")
    const og = await page.locator('meta[property="og:image"]').getAttribute("content")
    const res = await request.get(new URL(og!).pathname + new URL(og!).search)
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toBe("image/png")
  })

  test("crons refuse requests without the secret", async ({ request }) => {
    expect((await request.get("/api/cron/feeds")).status()).toBe(401)
    expect((await request.get("/api/cron/week-close", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401)
  })
})
