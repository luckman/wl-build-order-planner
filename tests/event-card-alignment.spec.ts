import { expect, test } from "@playwright/test"

const eventNames = ["Resources collected", "Mana spent", "Mana well is captured", "Mana well is lost", "Unit is killed"]

for (const faction of ["Light", "Dark"]) {
    for (const width of [1440, 390]) {
        test(`${faction} event names reserve equal space and icons align at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 })
            await page.goto(process.env.PLANNER_TEST_URL ?? "http://localhost:2987")
            await page.getByRole("button", { name: faction, exact: true }).click()
            const heroes = page.getByRole("region", { name: "heroes", exact: true })
            const positions = []
            for (const name of eventNames) {
                const card = heroes.getByRole("button", { name, exact: true })
                await card.scrollIntoViewIfNeeded()
                await expect(card).toBeVisible()
                const label = card.getByText(name, { exact: true })
                const labelBox = (await label.boundingBox())!
                const iconBox = (await card.locator("img").boundingBox())!
                const cardBox = (await card.boundingBox())!
                positions.push({ labelHeight: labelBox.height, iconTop: iconBox.y - cardBox.y })
                expect(iconBox.width).toBe(28)
                expect(iconBox.height).toBe(28)
                expect(iconBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height)
                expect(cardBox.x).toBeGreaterThanOrEqual(0)
                expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(width)
                expect(await label.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true)
                await card.focus()
                await page.keyboard.press("Enter")
                await expect(page.getByRole("dialog")).toBeVisible()
                await page.keyboard.press("Escape")
                await expect(card).toBeFocused()
            }
            const first = positions[0]
            for (const position of positions) {
                expect(position.labelHeight).toBeCloseTo(first.labelHeight, 1)
                expect(position.iconTop).toBeCloseTo(first.iconTop, 1)
            }
            await heroes.screenshot({ path: `test-results/event-cards-${faction}-${width}.png` })
        })
    }
}
