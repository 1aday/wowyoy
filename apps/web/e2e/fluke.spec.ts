import { expect, test, type Page } from "@playwright/test"

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(String(e)))
  return errors
}

test.describe("fluke test, two numbers", () => {
  test("judges two weeks, keeps the share path in the URL and reproduces it", async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto("/fluke")
    await page.getByRole("button", { name: "Two weeks" }).click()
    await expect(page.getByTestId("fluke-verdict")).toHaveText("Within noise.")
    await expect(page).toHaveURL(/\/fluke\/rate\/800\/4\.1\/3\.6$/)

    await page.getByLabel("Last week").fill("2.1%")
    await expect(page.getByTestId("fluke-verdict")).toHaveText("Real move.")
    await expect(page).toHaveURL(/\/fluke\/rate\/800\/4\.1\/2\.1$/)

    await page.getByRole("button", { name: "Count", exact: true }).click()
    await expect(page.getByTestId("fluke-verdict")).toHaveText("Real move.")
    await expect(page).toHaveURL(/\/fluke\/count\/1184\/1402$/)
    await page.reload()
    await expect(page.getByTestId("fluke-verdict")).toHaveText("Real move.")
    await expect(page.getByLabel("Week before")).toHaveValue("1,184")

    await page.getByRole("button", { name: "History", exact: true }).click()
    await expect(page.getByTestId("fluke-verdict")).toHaveText("Real move.")
    await expect(page).toHaveURL(/\/fluke\?m=/)
    expect(errors).toEqual([])
  })

  test("share pages are noindex with a canonical to /fluke, and bad paths 404", async ({ page, request }) => {
    await page.goto("/fluke/amount/13000/412000/447000")
    await expect(page.getByTestId("fluke-verdict")).toHaveText("Real move.")
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://wowyoy.com/fluke")
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/fluke\/og\?t=amount/)
    for (const bad of ["/fluke/rate/800/4.1", "/fluke/rate/800/140/3.6", "/fluke/ratio/1/2", "/fluke/count/abc/12"]) {
      expect((await request.get(bad)).status(), bad).toBe(404)
    }
  })

  test("share pages don't scroll sideways", async ({ page }) => {
    for (const path of ["/fluke/rate/800/4.1/3.6", "/fluke/count/1184/1402", "/fluke/average/1300/31.7/33.2?cv=0.9"]) {
      await page.goto(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, path).toBeLessThanOrEqual(0)
    }
  })

  test("renders a two-number share image", async ({ request }) => {
    const res = await request.get("/fluke/og?t=rate/800/4.1/3.6")
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toContain("image/png")
  })
})

test.describe("fluke api", () => {
  test("answers GET, POST and the CORS preflight", async ({ request }) => {
    const get = await request.get("/api/fluke?kind=rate&volume=800&before=4.1&after=3.6")
    expect(get.status()).toBe(200)
    expect(get.headers()["access-control-allow-origin"]).toBe("*")
    expect(await get.json()).toMatchObject({ call: "noise", url: "https://wowyoy.com/fluke/rate/800/4.1/3.6" })

    const post = await request.post("/api/fluke", { data: { values: [10, 11, 10, 12, 11, 10, 11, 10, 16] } })
    expect(post.status()).toBe(200)
    expect(await post.json()).toMatchObject({ test: "history" })

    const bad = await request.post("/api/fluke", { data: { kind: "rate", before: 4.1, after: 3.6 } })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).error).toMatch(/volume/)

    const pre = await request.fetch("/api/fluke", { method: "OPTIONS" })
    expect(pre.status()).toBe(204)
    expect(pre.headers()["access-control-allow-methods"]).toContain("POST")
  })
})
