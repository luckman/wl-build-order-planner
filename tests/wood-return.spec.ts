import { expect, test } from "@playwright/test"
import { selectFaction } from "./selectFaction"

test("reordering a wood return among simultaneous worker commands recalculates its outcome", async ({ page }) => {
    await page.goto("http://localhost:2987")
    const actions = page.getByRole("button", { name: "Worker events", exact: true })
    const woodReturnCard = page.getByRole("button", { name: "Bring wood back", exact: true })
    for (const name of ["Bring wood back", "Make Worker idle"]) {
        if (name === "Bring wood back") await woodReturnCard.click()
        else {
            await actions.click()
            await page.getByRole("menuitem", { name, exact: true }).click()
        }
        const dialog = page.getByRole("dialog", { name, exact: true })
        await dialog.getByLabel("Command time (mm:ss)").fill("00:08")
        await dialog.getByRole("button", { name: "Add event" }).click()
    }
    const rows = page.locator(".sortable-order > li")
    await expect(rows.first()).toContainText("Worker made idle before depositing the wood.")
    const handle = page.getByRole("button", { name: "Reorder Bring wood back, action 1" })
    await handle.focus()
    await handle.press("Space")
    await handle.press("ArrowDown")
    await handle.press("Space")
    await expect(rows.first()).toContainText("Make Worker idle")
    await expect(rows.nth(1)).toContainText("No wood gatherer is actively chopping.")
    await page.reload()
    await expect(rows.first()).toContainText("Make Worker idle")
    await expect(rows.nth(1)).toContainText("No wood gatherer is actively chopping.")
})

test("Light and Dark share the axe-and-log icon across the picker, Build order, and Timeline", async ({ page }, testInfo) => {
    let sharedSource: string | null = null
    for (const faction of ["Light", "Dark"] as const) {
        await page.setViewportSize({ width: faction === "Light" ? 1440 : 390, height: 900 })
        await page.goto("http://localhost:2987")
        await selectFaction(page, faction)
        const name = "Bring wood back"
        const card = page.getByRole("region", { name: "heroes", exact: true }).getByRole("button", { name, exact: true })
        const pickerIcon = card.locator("img")
        const source = (await pickerIcon.getAttribute("src"))!
        sharedSource ??= source
        expect(source).toBe(sharedSource)
        await expect.poll(() => pickerIcon.evaluate(image => {
            const icon = image as HTMLImageElement
            return [icon.naturalWidth, icon.naturalHeight]
        })).toEqual([252, 252])
        await card.screenshot({ path: testInfo.outputPath(`${faction}-picker.png`) })
        await card.click()
        const dialog = page.getByRole("dialog", { name, exact: true })
        await dialog.getByLabel("Command time (mm:ss)").fill("00:08")
        await dialog.getByRole("button", { name: "Add event" }).click()
        for (const phase of ["added", "reopened"]) {
            if (phase === "reopened") await page.reload()
            const row = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Remove ${name}` }) })
            const timeline = page.getByRole("button", { name, exact: true }).and(page.locator(".event"))
            for (const [surface, element] of [["order", row], ["timeline", timeline]] as const) {
                await expect(element.locator("img")).toHaveAttribute("src", source)
                await expect.poll(async () => (await element.locator("img").boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(28)
                await element.screenshot({ path: testInfo.outputPath(`${faction}-${phase}-${surface}.png`) })
            }
        }
    }
})
