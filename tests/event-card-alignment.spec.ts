import { expect, test } from "@playwright/test"

test.use({ hasTouch: true })

for (const faction of ["Light", "Dark"]) {
    const worker = faction === "Light" ? "Worker" : "Slave"
    const workerEvents = `${worker} events`
    const eventNames = ["Resources collected", "Mana spent", "Control point events", "Unit is killed", workerEvents]
    for (const width of [1440, 390]) {
        test(`${faction} event names reserve equal space and icons align at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 })
            await page.goto(process.env.PLANNER_TEST_URL ?? "http://localhost:2987")
            await page.getByRole("button", { name: faction, exact: true }).click()
            const heroes = page.getByRole("region", { name: "heroes", exact: true })
            const cards = heroes.getByRole("button").and(heroes.locator(".resource-card"))
            expect(await cards.evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label")))).toEqual(eventNames)
            const workerPortrait = page.getByRole("region", { name: "units", exact: true })
                .getByRole("button", { name: new RegExp(`^${worker} `) }).locator("img")
            const workerOptions = [
                ["Move from gold to wood", "Move gold miner to wood", `${faction.toLowerCase()}-move-gold-miner-to-wood`],
                ["Move from wood to gold", "Move wood gatherer to gold", `${faction.toLowerCase()}-move-wood-gatherer-to-gold`],
                [`Make ${worker} idle`, `Make ${worker} idle`, `${faction.toLowerCase()}-${worker.toLowerCase()}-idle`],
                [`Activate ${worker.toLowerCase()}`, `Make ${worker} active`, `${faction.toLowerCase()}-${worker.toLowerCase()}-active`],
                ["Limit gold miners", "Limit gold miners", `${faction.toLowerCase()}-limit-gold-miners`],
            ]
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
                if (name === workerEvents && width === 390) await card.tap()
                else await page.keyboard.press("Enter")
                if (name === "Control point events" || name === workerEvents) {
                    const menu = page.getByRole("menu", { name })
                    const options = menu.getByRole("menuitem")
                    const optionNames = name === workerEvents ? workerOptions.map(([label]) => label) : ["Mana well is captured", "Mana well is lost"]
                    await expect(options).toHaveText(optionNames)
                    await expect(options.first()).toBeFocused()
                    const box = (await menu.boundingBox())!
                    expect(box.x).toBeGreaterThanOrEqual(8)
                    expect(box.x + box.width).toBeLessThanOrEqual(width - 8)
                    expect(box.y).toBeGreaterThanOrEqual(8)
                    expect(box.y + box.height).toBeLessThanOrEqual(892)
                    if (name === "Control point events") {
                        await card.screenshot({ path: `test-results/point-card-${faction}-${width}.png` })
                    } else {
                        await expect(card.locator("img")).toHaveAttribute("src", (await workerPortrait.getAttribute("src"))!)
                        for (const [index, [label, dialogName, icon]] of workerOptions.entries()) {
                            const option = menu.getByRole("menuitem", { name: label, exact: true })
                            await expect(option.locator("img")).toHaveAttribute("src", new RegExp(icon))
                            await option.click()
                            const dialog = page.getByRole("dialog", { name: dialogName, exact: true })
                            await expect(dialog.getByLabel("Command time (mm:ss)")).toBeFocused()
                            await dialog.getByRole("button", { name: "Cancel" }).click()
                            await expect(card).toBeFocused()
                            if (index < workerOptions.length - 1) await card.click()
                        }
                        continue
                    }
                    await page.keyboard.press("Escape")
                    await expect(card).toBeFocused()
                    continue
                }
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
