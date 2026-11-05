import { expect, test, type Page } from "@playwright/test"
import { FILE_VERSION, GAME_RULES_VERSION } from "../src/game/buildOrderFile"
import { initialGameProfile, initialOpeningAction, type GameProfile } from "../src/game/gameProfile"

const url = process.env.PLANNER_TEST_URL ?? "http://localhost:2987"
const manaCard = (page: Page) => page.getByRole("region", { name: "heroes", exact: true }).getByRole("button", { name: "Mana spent", exact: true })
function documentFor(commands: unknown[], faction: "light" | "dark" = "light", profile: GameProfile = initialGameProfile) {
    return { format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
        faction, gameProfile: profile, buildOrder: [initialOpeningAction, ...commands] }
}
async function upload(page: Page, document: ReturnType<typeof documentFor>) {
    await page.getByLabel("Import build order JSON").setInputFiles({ name: "mana.wl-build-order.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) })
}
async function importPlan(page: Page, commands: unknown[], faction: "light" | "dark" = "light", profile = initialGameProfile) {
    await page.goto(url)
    await upload(page, documentFor(commands, faction, profile))
    await expect(page.getByText("Build order and game profile imported. Timings recalculated.", { exact: true })).toBeVisible()
}
const abundant = { ...initialGameProfile, player: { ...initialGameProfile.player, startingMana: 1000, baseManaLimit: 1000, manaAccumulation: 0 } }
async function enterSpend(page: Page, time: string, amount: string) {
    await manaCard(page).click()
    const dialog = page.getByRole("dialog", { name: "Mana spent", exact: true })
    await dialog.getByRole("textbox").fill(time)
    await dialog.getByRole("spinbutton", { name: "Mana amount" }).fill(amount)
    return dialog
}

test("Mana spent defaults, immediate spending, cooldown and edit identity", async ({ page }) => {
    await page.goto(process.env.PLANNER_TEST_URL ?? "http://localhost:2987")
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByRole("region", { name: "heroes", exact: true }).getByRole("button", { name: "Mana spent", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Mana spent", exact: true })
    await expect(dialog.getByRole("textbox")).toHaveValue("00:01")
    await expect(dialog.getByRole("spinbutton", { name: "Mana amount" })).toHaveValue("75")
    await expect(dialog.getByRole("alert")).toContainText("Insufficient mana")
    await dialog.getByRole("spinbutton", { name: "Mana amount" }).fill("35")
    await dialog.getByRole("textbox").fill("0000")
    await dialog.getByRole("button", { name: "Add event" }).click()
    await expect(page.locator(".resource-summary")).toContainText("Mana 0 / 50")
    await page.getByRole("region", { name: "heroes", exact: true }).getByRole("button", { name: "Mana spent", exact: true }).click()
    await dialog.getByRole("spinbutton", { name: "Mana amount" }).fill("1")
    await expect(dialog.getByRole("alert")).toContainText("cooldown")
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await page.getByRole("button", { name: /^Change Mana spent timestamp/ }).click()
    const edit = page.getByRole("dialog", { name: "Edit Mana spent", exact: true })
    await expect(edit.getByRole("spinbutton", { name: "Mana amount" })).toHaveValue("35")
    await edit.getByRole("button", { name: "Save event" }).click()
    await expect(page.getByRole("button", { name: "Remove Mana spent", exact: true })).toHaveCount(1)
})

for (const faction of ["light", "dark"] as const) {
    test(`${faction} cards, amount validation, command boundaries and faction drafts`, async ({ page }) => {
        await page.setViewportSize({ width: faction === "light" ? 1280 : 390, height: 900 })
        await importPlan(page, [], faction, abundant)
        const heroes = page.getByRole("region", { name: "heroes", exact: true })
        const names = await heroes.getByRole("button").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label")))
        expect(names.indexOf("Mana spent")).toBe(names.indexOf("Resources collected") + 1)
        expect(names.indexOf("Mana well is captured")).toBe(names.indexOf("Mana spent") + 1)
        const icon = manaCard(page).locator("img")
        await expect(icon).toHaveAttribute("src", new RegExp(`${faction}-mana-spent`))
        expect(await icon.evaluate(image => [image.getBoundingClientRect().width, image.getBoundingClientRect().height])).toEqual([28, 28])
        await manaCard(page).scrollIntoViewIfNeeded()
        await heroes.screenshot({ path: `.scratch/mana-${faction}-cards.png` })
        let dialog = await enterSpend(page, "0000", "75")
        for (const value of ["", "0", "-1", "1.5", "1e309"]) {
            await dialog.getByRole("spinbutton").fill(value)
            await expect(dialog.getByRole("button", { name: "Add event" })).toBeDisabled()
            await expect(dialog.getByRole("alert")).toContainText("positive whole-number")
        }
        await dialog.getByRole("spinbutton").fill("75")
        await dialog.getByRole("textbox").fill("3000")
        await expect(dialog.getByRole("textbox")).toHaveValue("29:59")
        await dialog.getByRole("textbox").fill("0060")
        await expect(dialog.getByRole("button", { name: "Add event" })).toBeDisabled()
        await dialog.getByRole("textbox").fill("2959")
        await expect(dialog.getByRole("button", { name: "Add event" })).toBeEnabled()
        const bounds = (await dialog.boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(faction === "light" ? 1280 : 390)
        await dialog.screenshot({ path: `.scratch/mana-${faction}-dialog.png` })
        await dialog.getByRole("button", { name: "Add event" }).click()
        await expect(page.getByRole("button", { name: "Remove Mana spent", exact: true })).toHaveCount(1)
        await manaCard(page).click()
        dialog = page.getByRole("dialog", { name: "Mana spent", exact: true })
        await expect(dialog.getByRole("textbox")).toHaveValue("29:59")
        await expect(dialog.getByRole("spinbutton")).toHaveValue("75")
        await dialog.press("Escape")
        await expect(manaCard(page)).toBeFocused()
        await page.reload()
        await expect(page.getByRole("button", { name: "Remove Mana spent", exact: true })).toHaveCount(1)
        await page.getByRole("button", { name: faction === "light" ? "Dark" : "Light", exact: true }).click()
        await expect(page.getByRole("button", { name: "Remove Mana spent", exact: true })).toHaveCount(0)
    })
}

test("newly regenerated mana is immediately spendable without order delay, with exact cooldown boundary", async ({ page }) => {
    const profile = { ...initialGameProfile, delays: { ...initialGameProfile.delays, orderDelay: 5 },
        player: { ...initialGameProfile.player, startingMana: 0, manaAccumulation: 60 } }
    await importPlan(page, [], "light", profile)
    let dialog = await enterSpend(page, "0006", "6")
    await dialog.getByRole("button", { name: "Add event" }).click()
    await expect(page.locator(".resource-summary")).toContainText("Mana 0 / 50")
    dialog = await enterSpend(page, "0015", "1")
    await expect(dialog.getByRole("alert")).toContainText("cooldown")
    await dialog.getByRole("textbox").fill("0016")
    await expect(dialog.getByRole("alert")).toHaveCount(0)
    await dialog.getByRole("button", { name: "Add event" }).click()
    await expect(page.locator(".resource-summary")).toContainText("Mana 9 / 50")
    await expect(page.locator(".order-blocked")).toHaveCount(0)
})

test("scrolls and Mana spent share cooldown while scroll order delay stays unchanged", async ({ page }) => {
    await importPlan(page, [{ type: "use-scroll", scrollId: "gold-rush", commandTime: 10 }], "light", abundant)
    let dialog = await enterSpend(page, "0019", "75")
    await expect(dialog.getByRole("alert")).toContainText("cooldown")
    await dialog.getByRole("textbox").fill("0020")
    await dialog.getByRole("button", { name: "Add event" }).click()
    await page.getByRole("region", { name: "heroes" }).getByRole("button", { name: /^Gold Rush/ }).click()
    const scroll = page.getByRole("dialog", { name: "Use Gold Rush" })
    await expect(scroll.getByRole("textbox")).toHaveValue("00:31")
    await scroll.getByRole("button", { name: "Add scroll" }).click()
    await expect(page.locator(".order-blocked")).toHaveCount(0)
    await expect(page.locator(".resource-summary")).toContainText("Mana 825 / 1000")
    await importPlan(page, [{ type: "mana-spent", commandTime: 10, mana: 75 },
        { type: "use-scroll", scrollId: "gold-rush", commandTime: 20 }], "light", abundant)
    await expect(page.locator(".order-blocked")).toContainText("Scroll cooldown")
    await page.getByRole("button", { name: /^Change Gold Rush timestamp/ }).click()
    await page.getByRole("dialog").getByRole("textbox").fill("0021")
    await page.getByRole("dialog").getByRole("button", { name: "Save timestamp" }).click()
    await expect(page.locator(".order-blocked")).toHaveCount(0)
})

test("timestamp collisions reject both command types in addition and editing, including blocked commands", async ({ page }) => {
    await importPlan(page, [{ type: "use-scroll", scrollId: "gold-rush", commandTime: 10 },
        { type: "mana-spent", commandTime: 30, mana: 75 }], "light", abundant)
    const dialog = await enterSpend(page, "0010", "1")
    await expect(dialog.getByRole("alert")).toContainText("cannot share a command timestamp")
    await dialog.getByRole("textbox").fill("0030")
    await expect(dialog.getByRole("alert")).toContainText("cannot share a command timestamp")
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await page.getByRole("button", { name: /^Change Mana spent timestamp/ }).click()
    const edit = page.getByRole("dialog", { name: "Edit Mana spent" })
    await expect(edit.getByRole("button", { name: "Save event" })).toBeEnabled()
    await edit.getByRole("textbox").fill("0010")
    await expect(edit.getByRole("alert")).toContainText("cannot share a command timestamp")
    await edit.getByRole("button", { name: "Cancel" }).click()
    await page.getByRole("button", { name: /^Change Gold Rush timestamp/ }).click()
    await page.getByRole("dialog").getByRole("textbox").fill("0030")
    await expect(page.getByRole("dialog").getByRole("alert").filter({ hasText: "cannot share a command timestamp" })).toBeVisible()
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click()
    await page.getByRole("region", { name: "heroes" }).getByRole("button", { name: /^Gold Rush/ }).click()
    await page.getByRole("dialog").getByRole("checkbox").uncheck()
    await page.getByRole("dialog").getByRole("textbox").fill("0030")
    await expect(page.getByRole("dialog").getByRole("alert").filter({ hasText: "cannot share a command timestamp" })).toBeVisible()
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click()
    await importPlan(page, [{ type: "use-scroll", scrollId: "gold-rush", commandTime: 0 }])
    await expect(page.locator(".order-blocked")).toContainText("Insufficient mana")
    const blockedCollision = await enterSpend(page, "0000", "1")
    await expect(blockedCollision.getByRole("alert")).toContainText("cannot share a command timestamp")
})

test("blocked expenditures have no mana or cooldown effect and profile changes retain intent", async ({ page }) => {
    await importPlan(page, [{ type: "mana-spent", commandTime: 0, mana: 2000 },
        { type: "use-scroll", scrollId: "gold-rush", commandTime: 1 }], "light", abundant)
    await expect(page.locator(".order-blocked")).toContainText("Insufficient mana for Mana spent")
    await expect(page.locator(".resource-summary")).toContainText("Mana 950 / 1000")
    await page.getByRole("button", { name: "Remove Mana spent", exact: true }).click()
    await expect(page.locator(".order-blocked")).toHaveCount(0)
    await importPlan(page, [{ type: "mana-spent", commandTime: 0, mana: 75 },
        { type: "use-scroll", scrollId: "lumber-gathering", commandTime: 11 }], "light", abundant)
    await page.getByLabel("Starting mana", { exact: true }).fill("50")
    await page.getByLabel("Starting mana", { exact: true }).press("Tab")
    await expect(page.locator(".order-blocked")).toContainText("Insufficient mana for Mana spent")
    await expect(page.locator(".resource-summary")).toContainText("Mana 25 / 1000")
    await page.getByLabel("Starting mana", { exact: true }).fill("100")
    await page.getByLabel("Starting mana", { exact: true }).press("Tab")
    await expect(page.locator(".order-blocked")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Remove Mana spent", exact: true })).toHaveCount(1)
    await importPlan(page, [{ type: "mana-spent", commandTime: 0, mana: 75 },
        { type: "mana-spent", commandTime: 5, mana: 75 }, { type: "use-scroll", scrollId: "gold-rush", commandTime: 11 }], "light", abundant)
    await expect(page.locator(".order-blocked")).toHaveCount(1)
    await expect(page.locator(".order-blocked")).toContainText("Scroll cooldown")
    await expect(page.locator(".resource-summary")).toContainText("Mana 875 / 1000")
    await importPlan(page, [{ type: "mana-spent", commandTime: 0, mana: 975 },
        { type: "use-scroll", scrollId: "gold-rush", commandTime: 11 }], "light", abundant)
    await expect(page.locator(".order-blocked")).toContainText("Insufficient mana")
    await page.getByRole("button", { name: "Remove Mana spent", exact: true }).click()
    await expect(page.locator(".order-blocked")).toHaveCount(0)
    await expect(page.locator(".resource-summary")).toContainText("Mana 950 / 1000")
})

test("timeline edits follow the saved event, preserve cancellation and recalculate after deletion", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await importPlan(page, [{ type: "mana-spent", commandTime: 0, mana: 75 },
        { type: "mana-spent", commandTime: 20, mana: 25 }], "dark", abundant)
    const event = page.locator("button.event.mana-spent").first()
    const id = await event.getAttribute("data-order-id")
    await event.focus()
    await event.press("Enter")
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Edit Mana spent" })
    await expect(dialog.getByRole("spinbutton")).toHaveValue("75")
    await dialog.getByRole("textbox").fill("1000")
    await dialog.getByRole("button", { name: "Save event" }).click()
    const moved = page.locator(`button.event[data-order-id="${id}"]`)
    await expect(moved).toBeFocused()
    await expect(moved).toHaveAttribute("title", /Command 10:00/)
    const viewport = page.locator(".timeline-scroll")
    const eventBox = (await moved.boundingBox())!, viewportBox = (await viewport.boundingBox())!
    expect(eventBox.x).toBeGreaterThanOrEqual(viewportBox.x - 1)
    expect(eventBox.x + eventBox.width).toBeLessThanOrEqual(viewportBox.x + viewportBox.width + 1)
    await moved.click()
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    await dialog.getByRole("spinbutton").fill("5")
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(page.locator(".order li").filter({ hasText: "75 mana" })).toHaveCount(1)
    await moved.click()
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
    await expect(page.getByRole("button", { name: "Remove Mana spent", exact: true })).toHaveCount(1)
    await expect(page.locator(".resource-summary")).toContainText("Mana 975 / 1000")
})

test("saving an amount edit updates only that event and may block a later scroll", async ({ page }) => {
    await importPlan(page, [{ type: "mana-spent", commandTime: 0, mana: 25 },
        { type: "use-scroll", scrollId: "gold-rush", commandTime: 11 },
        { type: "mana-spent", commandTime: 30, mana: 5 }], "light", abundant)
    const event = page.locator("button.event.mana-spent").first()
    const identity = await event.getAttribute("data-order-id")
    const editButton = page.getByRole("button", { name: "Change Mana spent timestamp, action 1", exact: true })
    for (const [amount, blocked] of [["975", true], ["25", false]] as const) {
        await editButton.click()
        const dialog = page.getByRole("dialog", { name: "Edit Mana spent" })
        await dialog.getByRole("spinbutton").fill(amount)
        await expect(dialog.getByRole("button", { name: "Save event" })).toBeEnabled()
        await dialog.getByRole("button", { name: "Save event" }).click()
        await expect(dialog).toHaveCount(0)
        await expect(page.locator(`button.event[data-order-id="${identity}"]`)).toHaveAttribute("title", /Command 0:00/)
        await expect(page.locator(".order li").filter({ hasText: `${amount} mana` })).toHaveCount(1)
        await expect(page.locator(".order li").getByText("5 mana", { exact: true })).toHaveCount(1)
        await expect(page.getByRole("button", { name: "Remove Mana spent", exact: true })).toHaveCount(2)
        await expect(page.locator(".order-blocked")).toHaveCount(blocked ? 1 : 0)
        if (blocked) await expect(page.locator(".order-blocked")).toContainText("Insufficient mana for Gold Rush")
    }
})

test("file export round trip, malformed amounts and collision imports preserve current plan", async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true }) })
    await importPlan(page, [{ type: "mana-spent", commandTime: 5, mana: 75 }], "dark", abundant)
    await page.getByText("Share / Import", { exact: true }).click()
    await page.getByText("JSON files", { exact: true }).click()
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Export JSON", exact: true }).click()
    const download = await downloadPromise
    const stream = (await download.createReadStream())!
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const exported = JSON.parse(Buffer.concat(chunks).toString())
    expect(exported.buildOrder).toEqual([initialOpeningAction, { type: "mana-spent", commandTime: 5, mana: 75 }])
    await upload(page, exported)
    await expect(page.getByRole("button", { name: "Remove Mana spent", exact: true })).toHaveCount(1)
    await page.getByText("Share / Import", { exact: true }).click()
    for (const mana of [0, -1, 1.5, "75", null]) {
        await upload(page, documentFor([{ type: "mana-spent", commandTime: 5, mana }]))
        await expect(page.getByRole("alert")).toContainText(/Mana spent amount|mana must be a finite number/)
        await expect(page.getByRole("button", { name: "Remove Mana spent", exact: true })).toHaveCount(1)
        await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveClass(/selected/)
    }
    for (const other of [{ type: "mana-spent", commandTime: 5, mana: 1 }, { type: "use-scroll", commandTime: 5, scrollId: "gold-rush" }]) {
        await upload(page, documentFor([{ type: "mana-spent", commandTime: 5, mana: 1 }, other]))
        await expect(page.getByRole("alert")).toContainText("cannot share a command timestamp")
        await expect(page.getByRole("button", { name: "Remove Mana spent", exact: true })).toHaveCount(1)
    }
    await importPlan(page, [{ type: "resources-collected", commandTime: 5, gold: 100, wood: 100 }])
    await expect(page.getByRole("button", { name: "Remove Resources collected", exact: true })).toHaveCount(1)
})

test("Copy link restores Mana spent through the existing sharing workflow", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url })
    await importPlan(page, [{ type: "mana-spent", commandTime: 42, mana: 75 }], "dark", abundant)
    await page.getByText("Share / Import", { exact: true }).click()
    await page.getByRole("button", { name: /^Copy link/ }).click()
    await expect(page.getByRole("status")).toContainText("Shareable link copied to clipboard.")
    const link = await page.evaluate(() => navigator.clipboard.readText())
    await page.goto(link)
    await expect(page.getByRole("status")).toContainText("Shared build order")
    await page.getByRole("button", { name: /^Change Mana spent timestamp/ }).click()
    const dialog = page.getByRole("dialog", { name: "Edit Mana spent" })
    await expect(dialog.getByRole("textbox")).toHaveValue("00:42")
    await expect(dialog.getByRole("spinbutton")).toHaveValue("75")
})
