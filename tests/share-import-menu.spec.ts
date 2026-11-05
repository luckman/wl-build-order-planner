import { expect, test } from "@playwright/test"

for (const width of [1440, 390]) {
    test(`Share / Import has distinct sharing, template and reachable JSON rows at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 780 })
        await page.goto(process.env.PLANNER_TEST_URL ?? "http://localhost:2987")
        // Dark has the longer template list and is the tighter layout case.
        await page.getByRole("button", { name: "Dark", exact: true }).click()
        const toggle = page.getByText("Share / Import", { exact: true })
        await toggle.focus()
        await page.keyboard.press("Enter")
        const copy = page.getByRole("button", { name: "Copy link", exact: true })
        const templates = page.getByRole("region", { name: "Start from template" })
        const json = page.getByText("JSON files", { exact: true })
        await expect(copy).toBeVisible()
        await expect(page.getByRole("button", { name: "Export JSON" })).toBeHidden()
        await page.keyboard.press("Tab")
        await expect(copy).toBeFocused()
        const buttons = [copy, ...await templates.getByRole("button").all()]
        const boxes = await Promise.all(buttons.map(button => button.boundingBox()))
        for (let index = 1; index < boxes.length; index++) {
            expect(boxes[index]!.y).toBeGreaterThanOrEqual(boxes[index - 1]!.y + boxes[index - 1]!.height)
            expect(boxes[index]!.width).toBeGreaterThan(200)
        }
        const lastTemplate = boxes[boxes.length - 1]!
        const previousTemplate = boxes[boxes.length - 2]!
        const ordinaryGap = lastTemplate.y - previousTemplate.y - previousTemplate.height
        const jsonBox = (await json.boundingBox())!
        expect(jsonBox.y - lastTemplate.y - lastTemplate.height).toBeGreaterThan(ordinaryGap + 24)
        await page.screenshot({ path: `test-results/share-import-${width}-collapsed.png`, fullPage: true })
        for (let index = 0; index < buttons.length; index++) await page.keyboard.press("Tab")
        await expect(json).toBeFocused()
        await page.keyboard.press("Enter")
        const exportAction = page.getByRole("button", { name: "Export JSON", exact: true })
        const importAction = page.getByRole("button", { name: "Import JSON", exact: true })
        const checkbox = page.getByRole("checkbox", { name: "Include calculated timings" })
        await page.keyboard.press("Tab")
        await expect(exportAction).toBeFocused()
        await page.keyboard.press("Tab")
        await expect(checkbox).toBeFocused()
        await expect(checkbox).not.toBeChecked()
        await page.keyboard.press("Space")
        await expect(checkbox).toBeChecked()
        await page.keyboard.press("Tab")
        await expect(importAction).toBeFocused()
        await expect(importAction).toBeInViewport()
        await expect(page.getByText("Export only", { exact: true })).toHaveCount(0)
        await expect(page.getByText(/Replaces build order and game profile/)).toBeVisible()
        const exportBox = (await exportAction.boundingBox())!
        const importBox = (await importAction.boundingBox())!
        const optionBox = (await page.getByText("Include calculated timings", { exact: true }).boundingBox())!
        const exportOptionGap = optionBox.y - exportBox.y - exportBox.height
        const importGap = importBox.y - optionBox.y - optionBox.height
        expect(exportOptionGap).toBeGreaterThanOrEqual(0)
        expect(importGap).toBeGreaterThan(exportOptionGap)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
        await page.screenshot({ path: `test-results/share-import-${width}-expanded.png`, fullPage: true })
        await page.keyboard.press("Escape")
        await expect(copy).toBeHidden()
        await expect(toggle).toBeFocused()
        await page.keyboard.press("Enter")
        await json.click()
        await expect(exportAction).toBeHidden()
    })
}
