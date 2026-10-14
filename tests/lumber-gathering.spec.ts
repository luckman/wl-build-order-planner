import { expect, test } from "@playwright/test"

for (const width of [1440, 1024, 390]) {
    test(`Lumber Gathering stays in the heroes row and can be added at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto("http://localhost:2987")
        const heroes = page.getByRole("region", { name: "heroes", exact: true })
        const gold = heroes.getByRole("button", { name: "Gold Rush 50 mana · 30s" })
        const lumber = heroes.getByRole("button", { name: "Lumber Gathering 25 mana · 30s" })
        await expect(gold).toHaveCount(1)
        await expect(lumber).toHaveCount(1)
        const boxes = await heroes.locator(".action").evaluateAll(elements => elements.map(element => {
            const { y, width } = element.getBoundingClientRect()
            return { y, width }
        }))
        expect(new Set(boxes.map(box => box.y)).size).toBe(1)
        expect(boxes.every(box => box.width === 70)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
        await lumber.click()
        const dialog = page.getByRole("dialog", { name: "Use Lumber Gathering" })
        await expect(dialog.getByLabel("Command time (mm:ss)")).toHaveValue("00:01")
        await expect(dialog).toContainText("25 mana")
        await expect(dialog).toContainText("+15 wood")
        await dialog.getByRole("button", { name: "Add scroll" }).click()
        await expect(page.getByRole("button", { name: "Remove Lumber Gathering" })).toHaveCount(1)
        await expect(page.locator("button.event.scroll")).toHaveAttribute("title", /start 0:02/)
        await page.screenshot({ path: `test-results/lumber-gathering-${width}.png`, fullPage: true })
    })
}
