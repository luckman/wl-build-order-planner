import { expect, test } from "@playwright/test"
import { parseBuildOrder } from "../src/game/buildOrderFile"

test("Gold Rush dialog supports automatic and fixed timing on desktop and mobile", async ({ page }) => {
    for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto("http://localhost:2987")
        await page.evaluate(() => localStorage.clear())
        await page.reload()
        const card = page.getByRole("region", { name: "heroes" }).getByRole("button", { name: /^Gold Rush/ })
        await card.click()
        const dialog = page.getByRole("dialog", { name: "Use Gold Rush" })
        await expect(dialog.getByRole("checkbox")).toBeChecked()
        await expect(dialog.getByLabel("Command time (mm:ss)")).toBeDisabled()
        await expect(dialog.getByLabel("Command time (mm:ss)")).toHaveValue("01:31")
        const bounds = (await dialog.boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
        await page.screenshot({ path: `test-results/scroll-dialog-${width}.png`, fullPage: true })
        await dialog.getByRole("button", { name: "Add scroll" }).click()
        await expect(page.locator(".order li")).toContainText("Command 1:31")
        await expect(page.getByRole("button", { name: /^Reorder Gold Rush/ })).toHaveCount(0)
        await card.click()
        await expect(dialog.getByLabel("Command time (mm:ss)")).toHaveValue("06:32")
        await dialog.getByRole("checkbox").uncheck()
        const time = dialog.getByLabel("Command time (mm:ss)")
        await time.fill("")
        for (const [digit, expected] of [["2", "00:02"], ["1", "00:21"], ["5", "02:15"]]) {
            await time.pressSequentially(digit)
            await expect(time).toHaveValue(expected)
        }
        for (const digits of ["0215", "215", "1234"]) {
            await time.fill("")
            await time.pressSequentially(digits)
            await expect(time).toHaveValue(digits === "1234" ? "12:34" : "02:15")
            await time.press("Tab")
        }
        await dialog.getByLabel("Command time (mm:ss)").fill("0142")
        await dialog.getByRole("button", { name: "Add scroll" }).click()
        await expect(page.locator(".order-blocked")).toContainText("Insufficient mana")
        await page.screenshot({ path: `test-results/scroll-order-${width}.png`, fullPage: true })
        await page.locator(".order li").nth(1).locator("img").click()
        const editor = page.getByRole("dialog", { name: "Change Gold Rush timestamp" })
        await expect(editor.getByLabel("Command time (mm:ss)")).toHaveValue("01:42")
        await editor.getByLabel("Command time (mm:ss)").fill("100.5")
        await page.screenshot({ path: `test-results/event-time-dialog-${width}.png`, fullPage: true })
        await editor.getByRole("button", { name: "Save timestamp" }).click()
        await expect(editor).toHaveCount(0)
        await expect(page.locator(".order li")).toHaveCount(2)
        const saved = await page.evaluate(() => localStorage.getItem("wl-build-draft-v2-light")!)
        const draft = parseBuildOrder(saved)
        expect(draft.faction).toBe("light")
        expect(draft.opening).toEqual({ type: "allocate-workers", goldWorkers: 4 })
        expect(JSON.parse(saved).buildOrder).toEqual([
            { type: "allocate-workers", goldWorkers: 4 },
            { type: "use-scroll", scrollId: "gold-rush", commandTime: 91 },
            { type: "use-scroll", scrollId: "gold-rush", commandTime: 60.5 },
        ])
        await page.reload()
        // Timed events display chronologically, so the edited event is now first.
        const edit = page.getByRole("button", { name: "Change Gold Rush timestamp, action 1" })
        await edit.focus()
        await edit.press("Enter")
        await expect(editor.getByLabel("Command time (mm:ss)")).toHaveValue("01:00.5")
        await expect(editor.getByLabel("Command time (mm:ss)")).toBeFocused()
        await editor.getByLabel("Command time (mm:ss)").press("Shift+Tab")
        await expect(editor.getByRole("button", { name: "Save timestamp" })).toBeFocused()
        await editor.press("Escape")
        await expect(editor).toHaveCount(0)
        await expect(edit).toBeFocused()
    }
})
