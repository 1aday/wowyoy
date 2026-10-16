import { expect, test } from "@playwright/test"

test.describe("design kit", () => {
  test("renders the Pulse with every metric and no errors", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(String(e)))
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    await page.goto("/kit")
    await expect(page.getByRole("table", { name: "Weekly Growth Pulse" }).locator("tbody tr")).toHaveCount(14)
    await expect(page.locator("h1")).toContainText(/\./)
    await expect(page.locator(".recharts-surface").first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test("keyboard moves the week and the selected metric", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard only")
    await page.goto("/kit")
    const range = page.getByText(/2026$/).first()
    const before = await range.textContent()
    await page.keyboard.press("[")
    await expect(range).not.toHaveText(before ?? "")
    await expect(page).toHaveURL(/week=/)
    await page.keyboard.press("j")
    await expect(page).toHaveURL(/metric=new_customers/)
  })

  test("has no horizontal page scroll", async ({ page }) => {
    await page.goto("/kit")
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
