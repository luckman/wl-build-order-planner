import { expect, test, type Page, type Locator } from "@playwright/test"
import { FILE_VERSION, GAME_RULES_VERSION, type BuildOrderDocument } from "../src/game/buildOrderFile"
import { initialGameProfile, initialOpeningAction } from "../src/game/gameProfile"

async function importBuild(page: Page, faction: "light" | "dark", commands: BuildOrderDocument["buildOrder"]) {
    await page.goto("http://localhost:2987")
    await page.getByLabel("Import build order JSON").setInputFiles({
        name: "timeline-editing.wl-build-order.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
            format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION, faction,
            gameProfile: { ...initialGameProfile, player: { ...initialGameProfile.player,
                startingGold: 10000, startingWood: 10000, startingMana: 50 } },
            buildOrder: [initialOpeningAction, ...commands],
        })),
    })
    await expect(page.getByText("Build order and game profile imported. Timings recalculated.", { exact: true })).toBeVisible()
}

async function expectInTimeline(event: Locator, viewport: Locator) {
    const eventBox = (await event.boundingBox())!
    const viewportBox = (await viewport.boundingBox())!
    expect(eventBox.x).toBeGreaterThanOrEqual(viewportBox.x - 1)
    expect(eventBox.x + eventBox.width).toBeLessThanOrEqual(viewportBox.x + viewportBox.width + 1)
    await expect(event).toBeFocused()
}

for (const width of [1440, 390]) {
    test(`timeline Edit follows a moved event in either direction at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto("http://localhost:2987")
        await page.getByRole("button", { name: "Resources collected", exact: true }).click()
        await page.getByRole("dialog").getByLabel("Command time (mm:ss)").fill("0005")
        await page.getByRole("dialog").getByRole("button", { name: "Resources collected", exact: true }).click()
        const event = page.locator("button.event.resources-collected")
        const viewport = page.locator(".timeline-scroll")
        for (const time of ["1000", "0005"]) {
            await event.click()
            await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
            const dialog = page.getByRole("dialog", { name: "Edit Resources collected" })
            await dialog.getByLabel("Command time (mm:ss)").fill(time)
            await dialog.getByRole("button", { name: "Save event" }).click()
            await expectInTimeline(event, viewport)
            if (time === "1000") {
                expect(await viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
                const position = await viewport.evaluate(element => element.scrollLeft)
                await event.click()
                await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
                await page.getByRole("dialog").getByLabel("Command time (mm:ss)").fill("1500")
                await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click()
                expect(await viewport.evaluate(element => element.scrollLeft)).toBe(position)
                await expect(event).toHaveAttribute("title", /Command 10:00/)
            }
        }
        await expect(event).toHaveAttribute("title", /Command 0:05/)
        await expect(page.getByRole("button", { name: "Remove Resources collected" })).toHaveCount(1)
    })
}

const editableCases: Array<{
    name: string; faction: "light" | "dark"; commands: BuildOrderDocument["buildOrder"]; save: string
}> = [
    { name: "Gold Rush", faction: "light", commands: [{ type: "use-scroll", scrollId: "gold-rush", commandTime: 60 }], save: "Save timestamp" },
    { name: "Lumber Gathering", faction: "light", commands: [{ type: "use-scroll", scrollId: "lumber-gathering", commandTime: 60 }], save: "Save timestamp" },
    { name: "Whip", faction: "dark", commands: [{ type: "use-scroll", scrollId: "whip", commandTime: 60 }], save: "Save timestamp" },
    { name: "Legion's Call", faction: "dark", commands: [{ itemId: "barracks" },
        { type: "use-scroll", scrollId: "legions-call", commandTime: 60, targetItemId: "barracks" }], save: "Save scroll" },
    { name: "Resources collected", faction: "light", commands: [{ type: "resources-collected", commandTime: 60, gold: 300, wood: 200 }], save: "Save event" },
    { name: "Mana well is captured", faction: "light", commands: [{ type: "mana-well-is-captured", commandTime: 60 }], save: "Save event" },
    { name: "Mana well is lost", faction: "dark", commands: [{ type: "mana-well-is-captured", commandTime: 30 },
        { type: "mana-well-is-lost", commandTime: 60 }], save: "Save event" },
    { name: "Unit is killed", faction: "light", commands: [{ type: "unit-is-killed", commandTime: 60, unitId: "worker" }], save: "Save event" },
]

for (const scenario of editableCases) {
    test(`timeline Edit reuses the current ${scenario.name} editor and saves the same event`, async ({ page }) => {
        await importBuild(page, scenario.faction, scenario.commands)
        const event = page.locator(".queue-lanes").getByRole("button", { name: scenario.name, exact: true })
        await event.click()
        const edit = page.getByRole("menuitem", { name: "Edit", exact: true })
        await expect(edit).toBeFocused()
        await edit.click()
        await expect(page.getByRole("menu")).toHaveCount(0)
        const dialog = page.getByRole("dialog")
        await expect(dialog.getByLabel("Command time (mm:ss)")).toHaveValue("01:00")
        if (scenario.name === "Resources collected") {
            await expect(dialog.getByLabel("Gold", { exact: true })).toHaveValue("300")
            await expect(dialog.getByLabel("Wood", { exact: true })).toHaveValue("200")
            await dialog.getByLabel("Gold", { exact: true }).fill("700")
            await dialog.getByLabel("Wood", { exact: true }).fill("-50")
        }
        if (scenario.name === "Legion's Call") {
            await expect(dialog.getByLabel("Target building")).toHaveValue("barracks")
            await dialog.getByLabel("Command time (mm:ss)").fill("0000")
            await expect(dialog.getByRole("button", { name: scenario.save })).toBeDisabled()
            await dialog.getByLabel("Target building").selectOption("citadel")
        }
        if (scenario.name === "Unit is killed") {
            await expect(dialog.getByLabel("Unit type")).toHaveValue("worker")
            await dialog.getByLabel("Unit type").selectOption("swordsman")
            await expect(dialog.getByRole("alert")).toContainText("living Swordsman")
            await expect(dialog.getByRole("button", { name: scenario.save })).toBeDisabled()
            await dialog.getByLabel("Unit type").selectOption("worker")
        }
        if (scenario.name === "Mana well is lost") {
            await dialog.getByLabel("Command time (mm:ss)").fill("0000")
            await expect(dialog.getByRole("alert")).toContainText("at least one owned mana well")
            await expect(dialog.getByRole("button", { name: scenario.save })).toBeDisabled()
        }
        await dialog.getByLabel("Command time (mm:ss)").fill("0110")
        await dialog.getByRole("button", { name: scenario.save }).click()
        await expect(event).toHaveAttribute("title", /Command 1:10/)
        await expect(event).toBeFocused()
        const row = page.locator(".order li").filter({ has: page.getByRole("button", { name: `Remove ${scenario.name}`, exact: true }) })
        await expect(row).toHaveCount(1)
        await expect(row).toContainText("Command 1:10")
        if (scenario.name === "Resources collected") await expect(row).toContainText("+700 gold · -50 wood")
        if (scenario.name === "Legion's Call") await expect(row).toContainText("Target: Citadel")
        await page.reload()
        await expect(event).toHaveAttribute("title", /Command 1:10/)
        await event.click()
        await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
        await expect(dialog.getByLabel("Command time (mm:ss)")).toHaveValue("01:10")
        if (scenario.name === "Resources collected") await expect(dialog.getByLabel("Gold", { exact: true })).toHaveValue("700")
        if (scenario.name === "Legion's Call") await expect(dialog.getByLabel("Target building")).toHaveValue("citadel")
    })
}

test("timeline menus support keyboard navigation and dismissal without changing the event", async ({ page }) => {
    await importBuild(page, "light", [
        { type: "resources-collected", commandTime: 60, gold: 100, wood: 0 },
        { type: "resources-collected", commandTime: 1200, gold: 200, wood: 0 },
    ])
    const event = page.locator("button.event.resources-collected").first()
    const viewport = page.locator(".timeline-scroll")
    await event.focus()
    await event.press("Enter")
    const edit = page.getByRole("menuitem", { name: "Edit", exact: true })
    const remove = page.getByRole("menuitem", { name: "Delete", exact: true })
    await expect(edit).toBeFocused()
    await edit.press("ArrowDown")
    await expect(remove).toBeFocused()
    await remove.press("ArrowDown")
    await expect(edit).toBeFocused()
    await edit.press("ArrowUp")
    await expect(remove).toBeFocused()
    await remove.press("Home")
    await expect(edit).toBeFocused()
    await edit.press("End")
    await expect(remove).toBeFocused()
    await remove.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)
    await expect(event).toBeFocused()
    await event.press("Enter")
    await edit.press("Tab")
    await expect(page.getByRole("menu")).toHaveCount(0)
    await event.click()
    await page.getByRole("heading", { name: "Timeline", exact: true }).click()
    await expect(page.getByRole("menu")).toHaveCount(0)
    await event.click()
    await page.setViewportSize({ width: 1100, height: 800 })
    await expect(page.getByRole("menu")).toHaveCount(0)
    await event.click()
    await viewport.evaluate(element => { element.scrollLeft += 10 })
    await expect(page.getByRole("menu")).toHaveCount(0)
    for (const dismiss of ["Escape", "backdrop"]) {
        await event.click()
        await edit.click()
        const position = await viewport.evaluate(element => element.scrollLeft)
        await page.getByRole("dialog").getByLabel("Command time (mm:ss)").fill("0500")
        if (dismiss === "Escape") await page.getByRole("dialog").press("Escape")
        else await page.locator(".scroll-dialog-backdrop").click({ position: { x: 1, y: 1 } })
        await expect(page.getByRole("dialog")).toHaveCount(0)
        await expect(event).toBeFocused()
        expect(await viewport.evaluate(element => element.scrollLeft)).toBe(position)
        await expect(event).toHaveAttribute("title", /Command 1:00/)
    }
})

test("editing one repeated scroll follows it across chronological and lane changes", async ({ page }) => {
    await importBuild(page, "light", [
        { type: "mana-well-is-captured", commandTime: 0 },
        { type: "use-scroll", scrollId: "gold-rush", commandTime: 60 },
        { type: "use-scroll", scrollId: "lumber-gathering", commandTime: 85 },
        { type: "use-scroll", scrollId: "gold-rush", commandTime: 1000 },
    ])
    await expect(page.getByText("Scrolls and events 2", { exact: true })).toBeVisible()
    const scrolls = page.locator(".queue-lanes").getByRole("button", { name: "Gold Rush", exact: true })
    await scrolls.filter({ hasText: "Gold Rush" }).and(page.locator('[title^="Command 1:00 ·"]')).click()
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    await page.getByRole("dialog").getByLabel("Command time (mm:ss)").fill("1000")
    await page.getByRole("dialog").getByRole("button", { name: "Save timestamp" }).click()
    await expect(scrolls).toHaveCount(2)
    await expect(scrolls.and(page.locator('[title^="Command 16:40 ·"]'))).toHaveCount(1)
    const moved = scrolls.and(page.locator('[title^="Command 10:00 ·"]'))
    await expect(page.getByText("Scrolls and events 2", { exact: true })).toHaveCount(0)
    await expectInTimeline(moved, page.locator(".timeline-scroll"))
    await expect(page.locator(".order li").filter({ has: page.getByRole("button", { name: "Remove Gold Rush", exact: true }) }).first())
        .toContainText("Command 10:00")
    await page.reload()
    await expect(scrolls).toHaveCount(2)
    await expect(moved).toHaveCount(1)
    await moved.click()
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
    await expect(scrolls).toHaveCount(1)
    await expect(scrolls).toHaveAttribute("title", /Command 16:40/)
    await expect(page.getByRole("button", { name: "Remove Gold Rush", exact: true })).toHaveCount(1)
})

test("construction, recruitment and upgrade menus keep Delete only", async ({ page }) => {
    await importBuild(page, "light", [{ itemId: "barracks" }, { itemId: "farm" }, { itemId: "castle-lvl-2" }, { itemId: "worker" }])
    for (const name of ["Castle lvl 2", "Worker", "Farm"]) {
        const event = page.locator(".queue-lanes").getByRole("button", { name, exact: true })
        await event.click()
        await expect(page.getByRole("menuitem")).toHaveCount(1)
        await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeFocused()
        await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
        await expect(event).toHaveCount(0)
        await expect(page.getByRole("button", { name: `Remove ${name}`, exact: true })).toHaveCount(0)
        await expect(page.getByRole("menu")).toHaveCount(0)
    }
})

test("editing from Build order leaves the timeline viewport in place", async ({ page }) => {
    await importBuild(page, "light", [
        { type: "resources-collected", commandTime: 5, gold: 100, wood: 0 },
        { type: "resources-collected", commandTime: 1200, gold: 200, wood: 0 },
    ])
    const viewport = page.locator(".timeline-scroll")
    const position = await viewport.evaluate(element => element.scrollLeft)
    await page.getByRole("button", { name: "Change Resources collected timestamp, action 1", exact: true }).click()
    await page.getByRole("dialog").getByLabel("Command time (mm:ss)").fill("1000")
    await page.getByRole("dialog").getByRole("button", { name: "Save event" }).click()
    const moved = page.locator('button.event.resources-collected[title^="Command 10:00 ·"]')
    await expect(moved).toHaveCount(1)
    expect(await viewport.evaluate(element => element.scrollLeft)).toBe(position)
    expect((await moved.boundingBox())!.x).toBeGreaterThan((await viewport.boundingBox())!.x + (await viewport.boundingBox())!.width)
})

test("a saved scroll that becomes blocked keeps existing warning and Build order editing", async ({ page }) => {
    await importBuild(page, "light", [
        { type: "use-scroll", scrollId: "gold-rush", commandTime: 60 },
        { type: "use-scroll", scrollId: "gold-rush", commandTime: 600 },
    ])
    const events = page.locator(".queue-lanes").getByRole("button", { name: "Gold Rush", exact: true })
    await expect(events).toHaveCount(2)
    await expect(page.locator(".blocked-actions")).toHaveCount(0)
    await events.and(page.locator('[title^="Command 10:00 ·"]')).click()
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    await page.getByRole("dialog").getByLabel("Command time (mm:ss)").fill("0105")
    await page.getByRole("dialog").getByRole("button", { name: "Save timestamp" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(events).toHaveCount(1)
    await expect(page.locator(".blocked-actions")).toContainText("Scroll cooldown")
    await expect(page.locator(".order-blocked")).toContainText("Scroll cooldown")
    await expect(page.getByRole("button", { name: "Remove Gold Rush", exact: true })).toHaveCount(2)
    await page.locator(".order-blocked").getByRole("button", { name: /Change Gold Rush timestamp/ }).click()
    await expect(page.getByRole("dialog").getByLabel("Command time (mm:ss)")).toHaveValue("01:05")
})
