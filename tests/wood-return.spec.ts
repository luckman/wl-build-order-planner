import { expect, test } from "@playwright/test"

test("reordering a wood return among simultaneous worker commands recalculates its outcome", async ({ page }) => {
    await page.goto("http://localhost:2987")
    const actions = page.getByRole("button", { name: "Worker events", exact: true })
    for (const name of ["Bring wood back to base", "Make Worker idle"]) {
        await actions.click()
        await page.getByRole("menuitem", { name, exact: true }).click()
        const dialog = page.getByRole("dialog", { name, exact: true })
        await dialog.getByLabel("Command time (mm:ss)").fill("00:08")
        await dialog.getByRole("button", { name: "Add event" }).click()
    }
    const rows = page.locator(".sortable-order > li")
    await expect(rows.first()).toContainText("Worker made idle before depositing the wood.")
    const handle = page.getByRole("button", { name: "Reorder Bring wood back to base, action 1" })
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
