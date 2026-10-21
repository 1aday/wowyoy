import { expect, test, type Page } from "@playwright/test"
import { MOCK_KEY, MOCK_PORT } from "./mock-posthog"

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  return errors
}

test.describe("landing", () => {
  test("states last week's answer over the real Pulse table", async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto("/")
    await expect(page.locator("h1")).toContainText(/\.$/)
    await expect(page.getByRole("table", { name: "Weekly Growth Pulse" }).locator("tbody tr")).toHaveCount(14)
    expect(errors).toEqual([])
  })
})

test.describe("sample workspace", () => {
  test("reads the Pulse, a Year in Mondays and the mapping", async ({ page, isMobile }) => {
    const errors = watchErrors(page)
    await page.goto("/demo")
    await expect(page.getByRole("table", { name: "Weekly Growth Pulse" }).locator("tbody tr")).toHaveCount(14)

    await page.getByRole("button", { name: /^Year in Mondays/ }).click()
    await expect(page).toHaveURL(/view=year/)
    const weeks = page.getByRole("group", { name: "Mondays" }).getByRole("button")
    await expect(weeks).toHaveCount(52)
    const headline = page.locator("h1")
    await weeks.nth(10).click()
    await expect(page).toHaveURL(/week=/)
    const label = await weeks.nth(10).getAttribute("aria-label")
    await expect(headline).toHaveText(label!.replace(/^Week of [^:]+: /, ""))

    await page.getByRole("button", { name: /^Mapping/ }).click()
    await expect(page.locator("h1")).toContainText(/events, \d+ metrics, \d+ weeks read\./)
    await expect(page.locator("[data-measure=orders]")).toContainText("order_completed")
    if (!isMobile) {
      await page.keyboard.press("1")
      await expect(page.getByRole("table", { name: "Weekly Growth Pulse" })).toBeVisible()
    }
    expect(errors).toEqual([])
  })
})

test.describe("fluke test", () => {
  test("judges a drop real and a return to normal a rebound, with a shareable link", async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto("/fluke")
    await expect(page.getByTestId("fluke-verdict")).toHaveText("Real move.")
    await page.getByRole("button", { name: "Back after a bad week" }).click()
    await expect(page.getByTestId("fluke-verdict")).toHaveText("Back to normal.")
    await expect(page).toHaveURL(/v=3410/)
    const shared = page.url()
    await page.goto(shared)
    await expect(page.getByTestId("fluke-verdict")).toHaveText("Back to normal.")
    expect(errors).toEqual([])
  })

  test("renders a share image", async ({ request }) => {
    const res = await request.get("/fluke/og?m=Orders&v=10,11,10,12,11,10,11,10,16")
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toContain("image/png")
  })
})

test.describe("connect PostHog", () => {
  test("maps events, reads the history and opens the workspace", async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto("/connect")
    await page.getByRole("button", { name: "Self-hosted" }).click()
    await page.getByLabel("PostHog host").fill(`http://localhost:${MOCK_PORT}`)

    await page.getByLabel("Personal API key").fill("phx_wrong")
    await page.getByRole("button", { name: "Read my events" }).click()
    await expect(page.getByText("PostHog didn't accept that key.")).toBeVisible()

    await page.getByLabel("Personal API key").fill(MOCK_KEY)
    await page.getByRole("button", { name: "Read my events" }).click()
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Linen & Co")
    await expect(page.locator("[data-measure=product_views]")).toContainText("Product Viewed")
    await expect(page.locator("[data-measure=revenue]")).toContainText("revenue")

    await page.getByRole("button", { name: "Looks right, read my history" }).click()
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 })
    await expect(page.getByRole("table", { name: "Weekly Growth Pulse" }).locator("tbody tr")).toHaveCount(11)
    await expect(page.locator("h1")).toContainText(/\.$/)

    await page.goto("/app?view=mapping")
    await page.getByRole("button", { name: "Disconnect" }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goto("/app")
    await expect(page).toHaveURL(/\/connect$/)
    expect(errors).toEqual([])
  })
})

test("no page scrolls sideways", async ({ page }) => {
  for (const path of ["/", "/demo", "/demo?view=year", "/demo?view=mapping", "/fluke", "/connect"]) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})
