import { expect, test, type Page } from "@playwright/test"

// Repo Pulse runs on GitHub fixtures in e2e (WOWYOY_GITHUB_FIXTURES=1): nothing here reaches GitHub.

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()))
  return errors
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe("Repo Pulse", () => {
  test("a repo page states the week's answer and judges every measure", async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto("/gh/posthog/posthog")
    await expect(page.getByTestId("repo-headline")).toHaveText("Stars ▲48%. A real move.")
    const rows = page.getByRole("table", { name: "Repo Pulse" }).locator("tbody tr")
    await expect(rows).toHaveCount(6)
    await expect(rows.first()).toHaveAttribute("aria-selected", "true")
    await expect(page.getByTestId("chart-title")).toHaveText("Stars moved beyond noise last week")
    await expect(page.locator(".recharts-surface").first()).toBeVisible()
    await expect(page.getByTestId("week-list").locator("li")).toHaveCount(9)
    await expect(page.getByTestId("badge-snippet")).toContainText("https://wowyoy.com/gh/posthog/posthog/badge.svg")
    await noSideScroll(page)
    expect(errors).toEqual([])
  })

  test("a row selects the measure", async ({ page }) => {
    await page.goto("/gh/posthog/posthog")
    await page.locator('tr[data-measure="prs-merged"]').click()
    await expect(page.getByTestId("chart-title")).toHaveText("PRs merged stayed within noise last week")
    await expect(page).toHaveURL(/m=prs-merged/)
    await page.reload()
    await expect(page.locator('tr[data-measure="prs-merged"]')).toHaveAttribute("aria-selected", "true")
  })

  test("says plainly when GitHub can't list a repo's stars", async ({ page }) => {
    await page.goto("/gh/vercel/next.js")
    await expect(page.getByTestId("measure-notes")).toContainText("first 40,000 stargazers")
    await expect(page.getByTestId("repo-headline")).toContainText("Issues closed ▲")
  })

  test("canonical URLs are lowercase", async ({ page }) => {
    await page.goto("/gh/PostHog/PostHog")
    await expect(page).toHaveURL(/\/gh\/posthog\/posthog$/)
  })

  test("missing, private, opted-out and rate-limited repos get designed pages", async ({ page }) => {
    const missing = await page.goto("/gh/nobody/does-not-exist")
    expect(missing?.status()).toBe(404)
    await expect(page.getByTestId("state-headline")).toHaveText("No public repo here.")
    await page.goto("/gh/wowyoy-fixtures/private-repo")
    await expect(page.getByTestId("state-headline")).toHaveText("No public repo here.")
    await page.goto("/gh/wowyoy-fixtures/opted-out")
    await expect(page.getByTestId("state-headline")).toHaveText("This repo opted out.")
    await page.goto("/gh/wowyoy-fixtures/rate-limited")
    await expect(page.getByTestId("state-headline")).toHaveText("GitHub's numbers are temporarily unavailable.")
    await noSideScroll(page)
  })

  test("the index searches and lists last week's real moves", async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto("/gh")
    await expect(page.getByTestId("moves").locator("li").first()).toBeVisible()
    await expect(page.getByTestId("moves")).toContainText("PostHog/posthog")
    await noSideScroll(page)
    await page.getByLabel("Any public repo").fill("https://github.com/vercel/next.js/issues")
    await page.getByRole("button", { name: "Read", exact: true }).click()
    await expect(page).toHaveURL(/\/gh\/vercel\/next\.js$/)
    expect(errors).toEqual([])
  })
})

test.describe("README badge", () => {
  test("is a cached, unindexed SVG in three sizes and two themes", async ({ request }) => {
    const res = await request.get("/gh/posthog/posthog/badge.svg")
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toContain("image/svg+xml")
    expect(res.headers()["cache-control"]).toBe("public, max-age=3600, s-maxage=3600")
    expect(res.headers()["x-robots-tag"]).toBe("noindex")
    const svg = await res.text()
    expect(svg).toContain('aria-label="stars: up 48% week over week · real"')
    expect(svg).toContain('height="20"')
    for (const [size, h] of [
      ["md", 28],
      ["lg", 40],
    ] as const) {
      expect(await (await request.get(`/gh/posthog/posthog/badge.svg?size=${size}`)).text()).toContain(`height="${h}"`)
    }
    const dark = await (await request.get("/gh/posthog/posthog/badge.svg?theme=dark")).text()
    expect(dark).toContain("#4ADE80")
  })

  test("never breaks: unknown repos and other measures still draw", async ({ request }) => {
    expect(await (await request.get("/gh/nobody/nothing/badge.svg")).text()).toContain("repo not found")
    expect(await (await request.get("/gh/posthog/posthog/badge.svg?measure=prs-merged")).text()).toContain('aria-label="PRs merged: down 6.7% week over week · noise"')
  })
})
