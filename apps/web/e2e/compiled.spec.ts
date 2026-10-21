import { expect, test, type Page } from "@playwright/test"

/** Page errors, console errors and failed same-origin requests (route prefetches aside). */
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()))
  page.on("response", (r) => {
    const url = new URL(r.url())
    if (r.status() >= 400 && !url.searchParams.has("_rsc")) errors.push(`${r.status()} ${url.pathname}`)
  })
  return errors
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe("the Standard", () => {
  test("indexes every metric by family and filters like a command line", async ({ page, isMobile }) => {
    const errors = watchErrors(page)
    await page.goto("/m")
    await expect(page.locator("h1")).toContainText("The Standard")
    const rows = page.locator("a[data-metric]")
    const total = await rows.count()
    expect(total).toBeGreaterThan(0)
    await expect(page.locator("#metric-index section h2").first()).toBeVisible()

    const filter = page.getByRole("textbox", { name: "Filter metrics" })
    if (!isMobile) {
      await page.keyboard.press("ControlOrMeta+k")
      await expect(filter).toBeFocused()
    }
    await filter.fill("checkout_started")
    await expect(page.locator("a[data-metric=checkout-conversion]")).toBeVisible()
    expect(await rows.count()).toBeLessThan(total)
    await filter.fill("zzzz-no-such-metric")
    await expect(rows).toHaveCount(0)
    await expect(page.getByText(/No metric matches/)).toBeVisible()
    await filter.press("Escape")
    await expect(rows).toHaveCount(total)
    await noSidewaysScroll(page)
    expect(errors).toEqual([])
  })

  test("a metric page compiles every block from its spec", async ({ page, context, browserName }) => {
    const errors = watchErrors(page)
    await page.goto("/m/checkout-conversion")
    await expect(page.locator("h1")).toHaveText("Checkout conversion")
    await expect(page.getByTestId("formula")).toContainText("order_completed")

    // Query tabs switch dialects, and the copy button copies the open one.
    const tabs = page.locator("#query").getByRole("tab")
    await expect(tabs).toHaveCount(4)
    const code = page.locator("#query pre")
    await expect(code).toHaveAttribute("data-dialect", "hogql")
    await tabs.filter({ hasText: "Postgres" }).click()
    await expect(code).toHaveAttribute("data-dialect", "postgres")
    await expect(code).toContainText("occurred_at")
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"])
      await page.locator("#query").getByTestId("copy-query").click()
      const copied = await page.evaluate(() => navigator.clipboard.readText())
      expect(copied).toContain("FILTER (WHERE")
      expect(copied).toBe((await code.textContent()) ?? "")
    }

    // The volume field moves the noise band.
    const band = page.getByTestId("band-value")
    await expect(band).toHaveAttribute("data-value", "±4.9 pt")
    const volume = page.getByRole("textbox", { name: /Your weekly volume/ })
    await volume.fill("3000")
    await expect(band).toHaveAttribute("data-value", "±2.5 pt")
    await page.getByRole("slider").fill("1000")
    await expect(band).not.toHaveAttribute("data-value", "±2.5 pt")

    await expect(page.locator("#example .recharts-surface")).toBeVisible()
    await expect(page.locator("#example")).toContainText("Example data")
    await expect(page.getByTestId("driver-tree").getByRole("listitem")).toHaveCount(6)
    await expect(page.getByRole("link", { name: "Why did checkout conversion drop?" })).toBeVisible()

    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}")
    expect(ld["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["DefinedTerm", "SoftwareSourceCode"])
    await noSidewaysScroll(page)
    expect(errors).toEqual([])
  })

  test("a process metric reads its range from its own weeks", async ({ page }) => {
    await page.goto("/m/mrr")
    await expect(page.locator("h1")).toHaveText("Monthly recurring revenue")
    await expect(page.getByTestId("band-explorer")).toHaveCount(0)
    await expect(page.locator("#normal-range")).toContainText("Its own weeks set the band")
    await expect(page.locator("#query pre")).toContainText("subscription_updated")
    await noSidewaysScroll(page)
  })

  test("aliases redirect to the one canonical page, unknown ids are 404", async ({ page }) => {
    await page.goto("/m/checkout-completion-rate")
    await expect(page).toHaveURL(/\/m\/checkout-conversion$/)
    const res = await page.goto("/m/no-such-metric")
    expect(res?.status()).toBe(404)
    await expect(page.locator("h1")).toContainText("No metric by that name")
  })
})

test.describe("why pages", () => {
  test("the index links both directions for every metric", async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto("/why")
    await expect(page.locator("h1")).toContainText("Why did it move?")
    await expect(page.getByRole("link", { name: "Why did checkout conversion drop?" })).toHaveAttribute("href", "/why/checkout-conversion-dropped")
    await noSidewaysScroll(page)
    expect(errors).toEqual([])
  })

  test("three steps in order: chance, the world, your business", async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto("/why/checkout-conversion-dropped")
    await expect(page.locator("h1")).toHaveText("Why did checkout conversion drop?")
    await expect(page.locator("#chance, #world, #business")).toHaveCount(3)
    const labels = await page.locator("ol > li[id] .label-mono").allTextContents()
    expect(labels.slice(0, 3).map((l) => l.replace(/\s+/g, " "))).toEqual(["Step 1 · Chance", "Step 2 · The world", "Step 3 · Your business"])

    await expect(page.getByTestId("band-explorer")).toBeVisible()
    await expect(page.getByTestId("world-events").locator("[data-feed]").first()).toBeVisible()

    // Each check's query is collapsed until asked for.
    const steps = page.getByTestId("business-steps")
    const details = steps.locator("details").first()
    await expect(details.locator("[data-slot=query-tabs]")).toBeHidden()
    await details.locator("summary").click()
    await expect(details.locator("[data-slot=query-tabs]")).toBeVisible()
    await expect(details.locator("pre")).toContainText("SELECT")
    // A breakdown driver's query splits this metric by its property.
    const byDevice = steps.locator("details", { hasText: "by $device_type" })
    await byDevice.locator("summary").click()
    await expect(byDevice.locator("pre")).toContainText("AS segment")

    await expect(page.getByRole("link", { name: /Why did checkout conversion spike\?/ })).toHaveAttribute("href", "/why/checkout-conversion-spiked")
    await expect(page.getByRole("link", { name: /Run this on every metric, every Monday/ })).toHaveAttribute("href", "/connect")
    await noSidewaysScroll(page)
    expect(errors).toEqual([])
  })

  test("a process metric's why page states its range in words", async ({ page }) => {
    await page.goto("/why/mrr-spiked")
    await expect(page.locator("h1")).toHaveText("Why did monthly recurring revenue spike?")
    await expect(page.locator("#chance")).toContainText("no sampling noise")
    await noSidewaysScroll(page)
  })
})
