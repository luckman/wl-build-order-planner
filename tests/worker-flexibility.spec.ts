import { expect, test } from "@playwright/test"
import { FILE_VERSION, GAME_RULES_VERSION } from "../src/game/buildOrderFile"
import { factions } from "../src/game/gameData"
import { initialGameProfile } from "../src/game/gameProfile"

for (const faction of ["light", "dark"] as const) for (const width of [1440, 390]) {
    test(`${faction} at ${width}px phase geometry, dialog keyboard controls and separate drag interaction`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 })
        await page.goto("http://localhost:2987")
        await page.getByRole("button", { name: faction === "light" ? "Light" : "Dark", exact: true }).click()
        await page.getByLabel("Starting gold", { exact: true }).fill("10000")
        await page.getByLabel("Starting wood", { exact: true }).fill("10000")
        const card = page.locator(".action-panel").getByRole("button", { name: /^Barracks \d/ })
        await card.click({ button: "right" })
        const dialog = page.getByRole("dialog")
        await dialog.getByLabel("Preparation (seconds)").fill("30")
        await dialog.getByLabel("Outward travel (seconds)", { exact: true }).fill("8")
        await dialog.getByLabel("Return travel (seconds)", { exact: true }).fill("12")
        await dialog.getByRole("button", { name: "Add order" }).click()
        const event = page.locator(".construction-event").first()
        await expect(event.locator(".construction-phase")).toHaveCount(4)
        await expect(event.locator(".phase-preparation")).toHaveAttribute("aria-label", "Preparation 0:00 to 0:30")
        const phases = await event.locator(".construction-phase").all()
        const boxes = await Promise.all(phases.map(phase => phase.boundingBox()))
        for (let i = 1; i < boxes.length; i++) expect(Math.abs(boxes[i]!.x - (boxes[i - 1]!.x + boxes[i - 1]!.width))).toBeLessThan(2)
        await expect(event).toHaveAttribute("title", /Departure 0:00 · Command 0:30/)
        await event.click()
        await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
        await expect(dialog.getByLabel("Preparation (seconds)")).toBeFocused()
        await dialog.getByLabel("Preparation (seconds)").press("Shift+Tab")
        await expect(dialog.getByRole("button", { name: "Save order" })).toBeFocused()
        await dialog.press("Escape")
        await expect(event).toBeFocused()
        const handle = page.getByRole("button", { name: "Reorder Barracks, action 1" })
        await handle.focus()
        await handle.press("Space")
        await expect(page.locator(".order-dragging")).toHaveCount(1)
        await expect(dialog).toHaveCount(0)
        await handle.press("Escape")
        await page.screenshot({ path: `test-results/${faction}-${width}-worker-phases.png`, fullPage: true })
    })
}

test("chained returns stop at reassignment and idle builders omit return phases", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const barracks = factions.light.items.find(item => item.id === "barracks")!
    const document = {
        format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION, faction: "light",
        gameProfile: { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: barracks.gold, startingWood: barracks.wood } },
        buildOrder: [{ type: "allocate-workers", goldWorkers: 0 },
            { type: "make-idle", commandTime: 0, count: 5 }, { type: "make-active", commandTime: 0, count: 1 },
            { itemId: "barracks", construction: { outwardDuration: 0, returnDuration: 12 } },
            { itemId: "barracks", construction: { outwardDuration: 0, returnDuration: 3 } },
            { type: "resources-collected", commandTime: 35, gold: 10000, wood: 10000 }],
    }
    await page.addInitScript(document => window.localStorage.setItem("wl-build-draft-v2-light", JSON.stringify(document)), document)
    await page.goto("http://localhost:2987")
    const events = page.locator(".construction-event")
    await expect(events).toHaveCount(2)
    await expect(events.first().locator(".phase-return")).toHaveAttribute("aria-label", "Return travel 0:31 to 0:36")
    await expect(events.first()).toHaveAttribute("title", /return interrupted 0:36/)
    const first = (await events.nth(0).boundingBox())!, second = (await events.nth(1).boundingBox())!
    expect(Math.abs(first.x + first.width - second.x)).toBeLessThan(2)
    expect(first.y).toBe(second.y)
    await page.locator(".action-panel").getByRole("button", { name: /^Farm \d/ }).click({ button: "right" })
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Use idle worker").check()
    await expect(dialog.getByLabel("Return travel (seconds)", { exact: true })).toBeDisabled()
    await dialog.getByRole("button", { name: "Add order" }).click()
    const idle = page.locator(".construction-event").filter({ hasText: "Farm" })
    await expect(idle).toHaveCount(1)
    await expect(idle.locator(".phase-return")).toHaveCount(0)
    await expect(idle).toHaveAttribute("title", /idle at completion.*no return travel/)
    await expect(page.locator(".resource-summary")).toContainText("Idle")
    await page.screenshot({ path: "test-results/chained-worker-phases.png", fullPage: true })
})
