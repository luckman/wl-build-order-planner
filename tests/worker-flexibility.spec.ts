import { expect, test } from "@playwright/test"
import { FILE_VERSION, GAME_RULES_VERSION } from "../src/game/buildOrderFile"
import { factions } from "../src/game/gameData"
import { initialGameProfile } from "../src/game/gameProfile"

for (const faction of ["Light", "Dark"] as const) {
    test(`${faction} worker event cards and restored events share readable artwork`, async ({ page }) => {
        await page.setViewportSize({ width: faction === "Light" ? 1440 : 320, height: 900 })
        await page.goto("http://localhost:2987")
        await page.getByRole("button", { name: faction, exact: true }).click()
        const worker = faction === "Light" ? "Worker" : "Slave"
        const names = [`Make ${worker} idle`, `Make ${worker} active`]
        const actions = page.getByRole("region", { name: "Actions", exact: true })
        const cards = actions.getByRole("region", { name: "heroes", exact: true }).getByRole("button")
        const finalCards = await cards.evaluateAll(buttons => buttons.slice(-7).map(button => button.getAttribute("aria-label")))
        expect(finalCards).toEqual(["Resources collected", "Mana spent", "Mana well is captured", "Mana well is lost", "Unit is killed", ...names])
        await expect(cards.filter({ hasText: /^Make (idle|active)$/ })).toHaveCount(0)
        const sources: string[] = []
        for (const [index, name] of names.entries()) {
            const card = actions.getByRole("button", { name, exact: true })
            const icon = card.locator("img")
            await expect(icon).toBeVisible()
            await expect.poll(() => icon.evaluate(image => [(image as HTMLImageElement).naturalWidth, (image as HTMLImageElement).naturalHeight])).toEqual([252, 252])
            sources.push((await icon.getAttribute("src"))!)
            await card.click()
            const dialog = page.getByRole("dialog", { name, exact: true })
            await dialog.getByLabel("Command time (mm:ss)").fill(index === 0 ? "00:10" : "02:00")
            await dialog.getByRole("button", { name: "Add event" }).click()
        }
        expect(sources[0]).not.toBe(sources[1])
        await page.getByRole("button", { name: faction === "Light" ? "Dark" : "Light", exact: true }).click()
        await expect(actions.getByRole("button", { name: names[0], exact: true })).toHaveCount(0)
        const otherWorker = faction === "Light" ? "Slave" : "Worker"
        await expect(actions.getByRole("button", { name: `Make ${otherWorker} idle`, exact: true }).locator("img")).not.toHaveAttribute("src", sources[0])
        await page.getByRole("button", { name: faction, exact: true }).click()
        await page.reload()
        for (const [index, name] of names.entries()) {
            await expect(page.getByRole("listitem").filter({ hasText: name }).locator("img")).toHaveAttribute("src", sources[index])
            await expect(page.getByRole("button", { name, exact: true }).and(page.locator('[aria-haspopup="menu"]')).locator("img")).toHaveAttribute("src", sources[index])
        }
        await actions.getByRole("button", { name: names[1], exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: `test-results/${faction}-worker-icons.png` })
    })
}

for (const faction of ["light", "dark"] as const) for (const width of [1440, 320]) {
    test(`${faction} at ${width}px phase geometry, dialog keyboard controls and separate drag interaction`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 })
        await page.goto("http://localhost:2987")
        await page.getByRole("button", { name: faction === "light" ? "Light" : "Dark", exact: true }).click()
        await page.getByLabel("Starting gold", { exact: true }).fill("10000")
        await page.getByLabel("Starting wood", { exact: true }).fill("10000")
        const card = page.locator(".action-panel").getByRole("button", { name: /^Barracks \d/ })
        await card.click({ button: "right" })
        const dialog = page.getByRole("dialog", { name: "Configure Barracks Construction" })
        await dialog.getByLabel("Preparation (seconds)").fill("30")
        await dialog.getByLabel("Preparation (seconds)").press("ArrowUp")
        await expect(dialog.getByLabel("Preparation (seconds)")).toHaveValue("30.1")
        await dialog.getByLabel("Preparation (seconds)").press("ArrowDown")
        await dialog.getByLabel("Outward travel (seconds)", { exact: true }).fill("8")
        await dialog.getByLabel("Return travel (seconds)", { exact: true }).fill("12")
        const fit = () => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)
        await expect.poll(fit).toBe(true)
        await dialog.getByLabel("Use idle worker").check()
        await expect(dialog.getByRole("button", { name: "Use global (3.0 s) for return travel" })).toBeDisabled()
        await expect(dialog.getByText(/saved duration is kept/)).toBeVisible()
        await expect.poll(fit).toBe(true)
        if (width === 320) await dialog.screenshot({ path: `test-results/${faction}-${width}-construction-dialog.png` })
        await dialog.getByLabel("Use idle worker").uncheck()
        if (width !== 320) await dialog.screenshot({ path: `test-results/${faction}-${width}-construction-dialog.png` })
        await dialog.getByRole("button", { name: "Add order" }).click()
        const event = page.locator(".construction-event").first()
        await expect(event.locator(".construction-phase")).toHaveCount(4)
        await expect(event.locator(".phase-preparation")).toHaveAttribute("aria-label", "Preparation 0:00 to 0:30")
        const phases = await event.locator(".construction-phase").all()
        const boxes = await Promise.all(phases.map(phase => phase.boundingBox()))
        for (let i = 1; i < boxes.length; i++) expect(Math.abs(boxes[i]!.x - (boxes[i - 1]!.x + boxes[i - 1]!.width))).toBeLessThan(2)
        await expect(event).toHaveText("Barracks")
        await expect(event).toHaveAttribute("title", /Departure 0:00 · Command 0:30/)
        await event.click()
        await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
        const editDialog = page.getByRole("dialog", { name: "Edit Barracks Construction" })
        await expect(editDialog.getByLabel("Preparation (seconds)")).toBeFocused()
        await editDialog.getByLabel("Preparation (seconds)").press("Shift+Tab")
        await expect(editDialog.getByRole("button", { name: "Save order" })).toBeFocused()
        await editDialog.press("Escape")
        await expect(event).toBeFocused()
        const handle = page.getByRole("button", { name: "Reorder Barracks, action 1" })
        await handle.scrollIntoViewIfNeeded()
        await handle.focus()
        await handle.press("Space")
        await expect(page.locator(".order-dragging")).toHaveCount(1)
        await expect(page.getByRole("dialog")).toHaveCount(0)
        await handle.press("Escape")
        await page.screenshot({ path: `test-results/${faction}-${width}-worker-phases.png`, fullPage: true })
    })
}

test("a long construction title and a sub-tenth duration fit and save at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 760 })
    await page.goto("http://localhost:2987")
    await page.getByRole("region", { name: "Actions" }).getByRole("button", { name: /^Tower of Light Magic \d/ }).click({ button: "right" })
    const dialog = page.getByRole("dialog", { name: "Configure Tower of Light Magic Construction" })
    await dialog.getByLabel("Preparation (seconds)").fill("0.25")
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await dialog.getByRole("button", { name: "Add order" }).click()
    await expect(dialog).toHaveCount(0)
    await page.getByRole("button", { name: "Remove Tower of Light Magic" }).locator("..").click()
    await expect(page.getByRole("dialog", { name: "Edit Tower of Light Magic Construction" }).getByLabel("Preparation (seconds)")).toHaveValue("0.25")
})

for (const width of [1440, 320]) {
    test(`construction and upgrade phases use consistent per-item color at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto("http://localhost:2987")
        await page.getByLabel("Starting gold", { exact: true }).fill("10000")
        await page.getByLabel("Starting wood", { exact: true }).fill("10000")
        await page.getByRole("button", { name: "Castle upgrade", exact: true }).click()
        await page.getByRole("menuitem", { name: /Castle lvl 2/ }).click({ button: "right" })
        const dialog = page.getByRole("dialog", { name: "Configure Castle Upgrade" })
        await dialog.getByLabel("Preparation (seconds)").fill("8")
        await dialog.getByRole("button", { name: "Add order" }).click()

        const upgrade = page.getByRole("button", { name: "Castle lvl 2", exact: true })
        const construction = page.getByRole("button", { name: "Barracks", exact: true })
        await expect(upgrade).toHaveText("Castle lvl 2")
        await expect(upgrade).toHaveAttribute("title", /Preparation: 8s/)
        await expect(upgrade.locator(".construction-phase")).toHaveCount(4)
        expect(await upgrade.evaluate(item => getComputedStyle(item).backgroundImage))
            .not.toBe(await construction.evaluate(item => getComputedStyle(item).backgroundImage))
        await upgrade.screenshot({ path: `test-results/light-${width}-upgrade-phases.png` })
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
    await expect(idle).not.toHaveAttribute("title", /worker returns/)
    await expect(page.locator(".resource-summary")).toContainText("Idle")
    await page.screenshot({ path: "test-results/chained-worker-phases.png", fullPage: true })
})
