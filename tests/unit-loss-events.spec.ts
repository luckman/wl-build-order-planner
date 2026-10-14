import { expect, test } from "@playwright/test"

test("Lose unit validates existence, releases food and uses small faction icons on desktop and mobile", async ({ page }) => {
    for (const width of [1280, 390]) {
        for (const faction of ["Light", "Dark"]) {
            await page.setViewportSize({ width, height: 900 })
            await page.goto("http://localhost:2987")
            await page.evaluate(() => localStorage.clear())
            await page.reload()
            await page.getByRole("button", { name: faction, exact: true }).click()
            const worker = faction === "Light" ? "Worker" : "Slave"
            const soldier = faction === "Light" ? "Swordsman" : "Goon"
            const heroes = page.getByRole("region", { name: "heroes", exact: true })
            const card = heroes.getByRole("button", { name: "Lose unit", exact: true })
            await card.scrollIntoViewIfNeeded()
            const image = card.locator("img")
            await expect(image).toHaveAttribute("src", new RegExp(`${faction.toLowerCase()}-lose-unit`))
            const unitCard = page.getByRole("region", { name: "units", exact: true }).getByRole("button", { name: new RegExp(`^${worker} `) })
            expect((await image.boundingBox())!.width).toBeLessThan((await unitCard.locator("img").boundingBox())!.width)
            const standardWidth = (await unitCard.boundingBox())!.width
            for (const eventCard of await heroes.locator(".resource-card").all())
                expect((await eventCard.boundingBox())!.width).toBe(standardWidth)
            await heroes.screenshot({ path: `test-results/unit-loss-cards-${faction}-${width}.png` })
            await card.click()
            const dialog = page.getByRole("dialog", { name: "Lose unit" })
            await expect(dialog.getByLabel("Command time (mm:ss)")).toHaveValue("00:01")
            await dialog.getByLabel("Unit type").selectOption({ label: soldier })
            await expect(dialog.getByRole("alert")).toContainText(`living ${soldier}`)
            await expect(dialog.getByRole("button", { name: "Add event" })).toBeDisabled()
            if (faction === "Light") await expect(dialog.getByRole("option", { name: "Gilbert", exact: true })).toHaveCount(1)
            const bounds = (await dialog.boundingBox())!
            expect(bounds.x).toBeGreaterThanOrEqual(0)
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
            await dialog.screenshot({ path: `test-results/unit-loss-dialog-${faction}-${width}.png` })
            await dialog.getByLabel("Unit type").selectOption({ label: worker })
            await dialog.getByLabel("Command time (mm:ss)").fill("0000")
            await dialog.getByRole("button", { name: "Add event" }).click()
            await expect(page.locator(".resource-summary")).toContainText("Food 8 / 20")
            await expect(page.locator(".resource-summary")).toContainText("Total workers 4")
            await expect(page.locator(".resource-summary")).toContainText("Gathering wood 0")
            await page.reload()
            await page.getByRole("button", { name: faction, exact: true }).click()
            await expect(page.getByRole("button", { name: "Remove Lose unit", exact: true })).toHaveCount(1)
            await page.getByRole("button", { name: "Change Lose unit timestamp, action 1", exact: true }).click()
            await dialog.getByLabel("Command time (mm:ss)").fill("0020")
            await dialog.getByRole("button", { name: "Save event" }).click()
            await expect(page.locator(".order li")).toContainText("Command 0:20")
        }
    }
})
