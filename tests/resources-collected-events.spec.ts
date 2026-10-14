import { expect, test } from "@playwright/test"

test("resource card placement and exact-time dialog work on desktop and mobile", async ({ page }) => {
    for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto("http://localhost:2987")
        await page.evaluate(() => localStorage.clear())
        await page.reload()
        const heroes = page.getByRole("region", { name: "heroes", exact: true })
        const cards = heroes.locator(".action-grid > *")
        await expect(cards.nth(5)).toHaveAccessibleName(/^Lumber Gathering/)
        await expect(cards.nth(6)).toHaveClass("scroll-card-delimiter")
        await expect(cards.nth(7)).toHaveAccessibleName("Resources collected")
        await heroes.getByRole("button", { name: "Resources collected", exact: true }).scrollIntoViewIfNeeded()
        await heroes.screenshot({ path: `test-results/resources-collected-card-${width}.png` })
        await heroes.getByRole("button", { name: "Resources collected", exact: true }).click()
        const dialog = page.getByRole("dialog")
        await expect(dialog.getByLabel("Command time (mm:ss)")).toHaveValue("00:01")
        await expect(dialog.getByLabel("Gold", { exact: true })).toHaveValue("300")
        await expect(dialog.getByLabel("Wood", { exact: true })).toHaveValue("300")
        await dialog.getByLabel("Command time (mm:ss)").fill("0000")
        const bounds = (await dialog.boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
        await page.screenshot({ path: `test-results/resources-collected-dialog-${width}.png`, fullPage: true })
        await dialog.getByRole("button", { name: "Resources collected", exact: true }).click()
        await expect(page.locator(".resource-summary")).toContainText("Gold 450")
        await expect(page.locator(".resource-summary")).toContainText("Wood 350")
        await expect(page.locator(".order li")).toContainText("Command 0:00")
        await page.getByRole("button", { name: "Dark", exact: true }).click()
        await expect(heroes.getByRole("button", { name: "Resources collected", exact: true })).toBeVisible()
    }
})
