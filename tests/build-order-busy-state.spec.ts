import { expect, test, type Page } from "@playwright/test"
import { FILE_VERSION, GAME_RULES_VERSION } from "../src/game/buildOrderFile"
import { initialGameProfile } from "../src/game/gameProfile"
import { createShareableLink } from "../src/game/shareableLink"

const plannerUrl = "http://localhost:2987"
const planner = (page: Page) => page.locator(".sc2-shell")
const busyStatus = (page: Page) => page.getByText("Updating build order…", { exact: true })
const spinner = (page: Page) => page.locator(".build-order-spinner")

// Hold or fail a real worker request at the browser boundary. The test clock
// controls only the page, so it can advance independently of the worker.
async function controlWorker(page: Page) {
    await page.addInitScript(() => {
        const pending: Array<(fail: boolean) => void> = []
        Object.assign(window, { buildOrderWork: pending })
        const BrowserWorker = window.Worker
        window.Worker = class extends BrowserWorker {
            postMessage(message: unknown) {
                pending.push(fail => {
                    if (fail) this.dispatchEvent(new ErrorEvent("error"))
                    else super.postMessage(message)
                })
            }
        }
    })
}

async function releaseWorker(page: Page, fail = false) {
    await page.evaluate(fail => {
        const pending = (window as unknown as { buildOrderWork: Array<(fail: boolean) => void> }).buildOrderWork
        pending.shift()!(fail)
    }, fail)
}

async function configureBarracks(page: Page) {
    await page.getByLabel("Starting gold", { exact: true }).fill("2000")
    await page.getByLabel("Starting wood", { exact: true }).fill("2000")
    await page.locator(".action-panel").getByRole("button", { name: /^Barracks \d/ }).click({ button: "right" })
    const dialog = page.getByRole("dialog", { name: "Configure Barracks Construction" })
    await dialog.getByLabel("Preparation (s)").fill("30")
    return dialog.getByRole("button", { name: "Add order" })
}

async function expectPreparedBarracks(page: Page) {
    await expect(page.locator(".sortable-order li").first()).toContainText("Barracks")
    await expect(page.locator(".phase-preparation").first()).toHaveAttribute("aria-label", "Preparation 0:00 to 0:30")
}

for (const outcome of ["fast", "slow", "failed"] as const) {
    test(`configured construction unlocks after a ${outcome} update`, async ({ page }) => {
        await controlWorker(page)
        await page.clock.install()
        await page.goto(plannerUrl)
        const add = await configureBarracks(page)
        const dark = page.getByRole("button", { name: "Dark", exact: true })
        const darkBox = (await dark.boundingBox())!
        await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 500))
        await add.dispatchEvent("click")

        await expect(planner(page)).toHaveAttribute("aria-busy", "true")
        await expect(busyStatus(page)).toHaveCount(1)
        await expect(spinner(page)).toHaveCount(0)
        await expect(page.locator(".sortable-order li")).toHaveCount(0)
        if (outcome !== "fast") {
            await page.mouse.click(darkBox.x + darkBox.width / 2, darkBox.y + darkBox.height / 2)
            await page.keyboard.press("Tab")
            await page.keyboard.press("Enter")
            expect(await planner(page).evaluate(element => element.contains(document.activeElement))).toBe(false)
            await expect(page.locator(".factions .selected")).toHaveText("Light")
            await page.clock.runFor(99)
            await expect(spinner(page)).toHaveCount(0)
            await page.clock.runFor(1)
            await expect(spinner(page)).toBeVisible()
            const box = (await spinner(page).boundingBox())!
            expect(box.x + box.width / 2).toBeCloseTo(640, 0)
            expect(box.y + box.height / 2).toBeCloseTo(360, 0)
        }
        await releaseWorker(page, outcome === "failed")
        await expect(planner(page)).toHaveAttribute("aria-busy", "false")
        await expect(spinner(page)).toHaveCount(0)
        if (outcome === "failed") {
            await expect(page.getByRole("alert").filter({ hasText: "Could not update the build order" })).toBeVisible()
            await expect(page.locator(".sortable-order li")).toHaveCount(0)
            await expect(page.getByRole("dialog", { name: "Configure Barracks Construction" })).toBeVisible()
        } else {
            await expectPreparedBarracks(page)
        }
    })
}

test("recalculates a real build order with repeated preparation", async ({ page }) => {
    await page.addInitScript(file => localStorage.setItem("wl-build-draft-v2-light", JSON.stringify(file)), {
        format: "wl-build-order",
        version: FILE_VERSION,
        gameRulesVersion: GAME_RULES_VERSION,
        faction: "light",
        gameProfile: {
            ...initialGameProfile,
            player: { ...initialGameProfile.player, startingGold: 2000, startingWood: 2000 },
        },
        buildOrder: [
            { type: "allocate-workers", goldWorkers: 4 },
            ...["farm", "sawmill"].map(itemId => ({ itemId, construction: { preparationDuration: 15 } })),
        ],
    })
    await page.goto(plannerUrl)
    const rows = page.locator(".sortable-order li")
    await expect(rows).toHaveCount(2)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const add = await configureBarracks(page)
    await add.click()
    await expect(rows).toHaveCount(3)
    await expect(rows.last()).toContainText("Barracks")
    await expect(page.locator(".phase-preparation")).toHaveCount(3)
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
})

test("paints and animates the spinner while the simulation worker runs CPU work", async ({ page, context }) => {
    await page.addInitScript(() => {
        const BrowserWorker = window.Worker
        window.Worker = class extends BrowserWorker {
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options)
                this.addEventListener("message", event => {
                    if (event.data === "cpu-started" || event.data === "cpu-finished") {
                        document.documentElement.dataset.simulationCpu = event.data
                        event.stopImmediatePropagation()
                    }
                })
            }
        }
    })
    await context.route(/\/build-order-simulation\..*\.chunk\.js$/, async route => {
        const response = await route.fetch()
        const cpuWork = `self.addEventListener("message", () => {
            self.postMessage("cpu-started");
            const until = performance.now() + 1500;
            while (performance.now() < until) {}
            self.postMessage("cpu-finished");
        });`
        await route.fulfill({ response, body: cpuWork + await response.text() })
    })
    await page.goto(plannerUrl)
    const add = await configureBarracks(page)
    await add.click()
    await expect(spinner(page)).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("data-simulation-cpu", "cpu-started")
    const frames = await spinner(page).evaluate(async element => {
        const before = getComputedStyle(element).transform
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return [before, getComputedStyle(element).transform]
    })
    expect(frames[0]).not.toEqual(frames[1])
    await expect(page.locator("html")).toHaveAttribute("data-simulation-cpu", "cpu-started")
    await expectPreparedBarracks(page)
    await expect(spinner(page)).toHaveCount(0)
})

test("locks once for prerequisite insertion, reorder, edit, and deletion", async ({ page }) => {
    await controlWorker(page)
    await page.goto(plannerUrl)
    await page.getByLabel("Starting gold", { exact: true }).fill("2000")
    await page.getByLabel("Starting wood", { exact: true }).fill("2000")
    const rows = page.locator(".sortable-order li")
    const completeUpdate = async () => {
        await expect(planner(page)).toHaveAttribute("aria-busy", "true")
        await releaseWorker(page)
        await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    }
    await page.locator(".action-panel").getByRole("button", { name: /^Swordsman \d/ }).click()
    await expect(rows).toHaveCount(0)
    await completeUpdate()
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toContainText("Barracks")
    await expect(rows.last()).toContainText("Swordsman")
    await expect(page.locator(".event.unit")).toContainText("Swordsman")

    const handle = page.getByRole("button", { name: "Reorder Swordsman, action 2" })
    await handle.press("Space")
    await handle.press("ArrowUp")
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await handle.press("Space")
    await expect(rows.first()).toContainText("Barracks")
    await completeUpdate()
    await expect(rows.first()).toContainText("Swordsman")
    await expect(page.getByRole("region", { name: "Blocked actions" })).toContainText("Requires")

    const barracks = page.locator(".construction-event").filter({ hasText: "Barracks" })
    await barracks.click()
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const edit = page.getByRole("dialog", { name: "Edit Barracks Construction" })
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await edit.getByRole("button", { name: "Cancel" }).click()
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await barracks.click()
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    await edit.getByLabel("Preparation (s)").fill("15")
    await edit.getByRole("button", { name: "Save order" }).click()
    await completeUpdate()
    await expect(barracks.locator(".phase-preparation")).toHaveCount(1)
    await expect(barracks).toBeFocused()

    await barracks.click()
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
    await completeUpdate()
    await expect(barracks).toHaveCount(0)
    await expect(rows).toHaveCount(1)
    await page.getByRole("button", { name: "Remove Swordsman" }).click()
    await completeUpdate()
    await expect(rows).toHaveCount(0)
})

test("locks when a timed event is submitted and shows its row and timeline on release", async ({ page }) => {
    await controlWorker(page)
    await page.goto(plannerUrl)
    await page.getByRole("region", { name: "Actions", exact: true }).getByRole("button", { name: "Resources collected" }).click()
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    const dialog = page.getByRole("dialog", { name: "Resources collected" })
    await dialog.getByLabel("Gold", { exact: true }).fill("50")
    await dialog.getByRole("button", { name: "Resources collected", exact: true }).click()
    await expect(planner(page)).toHaveAttribute("aria-busy", "true")
    await releaseWorker(page)
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await expect(page.locator(".sortable-order li")).toContainText("+50 gold")
    await expect(page.getByRole("button", { name: "Resources collected", exact: true }).and(page.locator('[aria-haspopup="menu"]'))).toBeVisible()
})

test("locks for template application, opening allocation and Clear", async ({ page }) => {
    await controlWorker(page)
    await page.goto(plannerUrl)
    const profile = page.getByLabel("Starting gold", { exact: true })
    await page.getByRole("button", { name: "Dark", exact: true }).click()
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await page.getByRole("button", { name: "Light", exact: true }).click()
    await profile.fill("900")
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    const rows = page.locator(".sortable-order li")

    await page.locator(".action-panel").getByRole("button", { name: /^Worker \d/ }).click()
    await releaseWorker(page)
    await expect(rows).toHaveCount(1)
    await page.getByText("Share / Import", { exact: true }).click()
    const template = page.getByRole("button", { name: "10 workers T2 with swordsman" })
    page.once("dialog", dialog => dialog.dismiss())
    await template.click()
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await expect(rows).toHaveCount(1)
    page.once("dialog", dialog => dialog.accept())
    await template.click()
    await expect(planner(page)).toHaveAttribute("aria-busy", "true")
    await expect(rows).toHaveCount(1)
    await expect(page.getByText("Build order template loaded.", { exact: false })).toHaveCount(0)
    await releaseWorker(page)
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await expect(rows).toHaveCount(9)
    await expect(profile).toHaveValue("900")
    await expect(page.getByRole("status")).toContainText("Build order template loaded.")

    const slider = page.getByRole("slider", { name: "Initial gold miners" })
    await expect(slider).toHaveValue("3")
    const track = (await slider.boundingBox())!
    const trackY = track.y + track.height / 2
    await page.mouse.move(track.x + track.width * 2 / 3, trackY)
    await page.mouse.down()
    await page.mouse.move(track.x + track.width - 3, trackY)
    await expect(slider).toHaveValue("4")
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await page.mouse.move(track.x + 3, trackY)
    await expect(slider).toHaveValue("1")
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await page.mouse.up()
    await expect(planner(page)).toHaveAttribute("aria-busy", "true")
    await expect(page.getByText("Initial gold miners: 3 · Initial wood gatherers: 2")).toBeVisible()
    await releaseWorker(page)
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await expect(slider).toHaveValue("1")

    await slider.press("ArrowRight")
    await expect(planner(page)).toHaveAttribute("aria-busy", "true")
    await releaseWorker(page)
    await expect(slider).toHaveValue("2")

    await page.getByRole("button", { name: "Clear", exact: true }).click()
    await expect(planner(page)).toHaveAttribute("aria-busy", "true")
    await expect(rows).toHaveCount(9)
    await expect(page.getByText("Initial gold miners: 2 · Initial wood gatherers: 3")).toBeVisible()
    await releaseWorker(page)
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await expect(rows).toHaveCount(0)
    await expect(slider).toHaveValue("4")
})

test("locks only after validating a JSON file and reports completion with the imported plan", async ({ page }) => {
    await controlWorker(page)
    await page.goto(plannerUrl)
    await page.getByText("Share / Import", { exact: true }).click()
    await page.getByText("JSON files", { exact: true }).click()
    const chooseFile = async () => {
        const chooser = page.waitForEvent("filechooser")
        await page.getByRole("button", { name: "Import JSON" }).click()
        await expect(planner(page)).toHaveAttribute("aria-busy", "false")
        return chooser
    }

    await (await chooseFile()).setFiles([])
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await expect(page.getByRole("alert")).toHaveCount(0)
    await (await chooseFile()).setFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{") })
    await expect(page.getByRole("alert")).toContainText("The file is not valid JSON.")
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await (await chooseFile()).setFiles({
        name: "valid.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
            format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: "test-older-rules", faction: "dark",
            gameProfile: { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 900, startingWood: 800 } },
            buildOrder: [{ type: "allocate-workers", goldWorkers: 3 }, { itemId: "barracks" }],
        })),
    })
    await expect(planner(page)).toHaveAttribute("aria-busy", "true")
    await expect(page.locator(".factions .selected")).toHaveText("Light")
    await expect(page.locator(".sortable-order li")).toHaveCount(0)
    await expect(page.locator(".file-notice")).toHaveCount(0)
    await expect(spinner(page)).toBeVisible()
    await releaseWorker(page)
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await expect(page.locator(".factions .selected")).toHaveText("Dark")
    await expect(page.getByLabel("Starting gold", { exact: true })).toHaveValue("900")
    await expect(page.locator(".sortable-order li")).toContainText("Barracks")
    await expect(page.locator(".construction-event")).toContainText("Barracks")
    await expect(page.getByRole("status")).toContainText("different game rules")
})

test("a validated shared link waits for the current update and announces its own completion", async ({ page }) => {
    await controlWorker(page)
    await page.goto(plannerUrl)
    await page.evaluate(() => { location.hash = "build=invalid" })
    await expect(page.getByRole("alert")).toContainText("Unsupported shareable link version.")
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")

    await page.locator(".action-panel").getByRole("button", { name: /^Worker \d/ }).click()
    await expect(planner(page)).toHaveAttribute("aria-busy", "true")
    const profile = { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 765 } }
    const hash = new URL(createShareableLink(plannerUrl, "dark", profile, [], { type: "allocate-workers", goldWorkers: 2 })).hash
    await page.evaluate(hash => { location.hash = hash }, hash)
    await expect(page.locator(".factions .selected")).toHaveText("Light")
    await releaseWorker(page)

    await expect(page.locator(".sortable-order li")).toContainText("Worker")
    await expect(planner(page)).toHaveAttribute("aria-busy", "true")
    await expect(page.locator(".file-notice-success")).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp("#build="))
    await expect(spinner(page)).toBeVisible()
    await releaseWorker(page)
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await expect(page.locator(".factions .selected")).toHaveText("Dark")
    await expect(page.locator(".sortable-order li")).toHaveCount(0)
    await expect(page.getByLabel("Starting gold", { exact: true })).toHaveValue("765")
    await expect(page.getByRole("slider", { name: "Initial gold miners" })).toHaveValue("2")
    await expect(page.getByRole("status")).toContainText("Shared build order")
    await expect(page).toHaveURL(plannerUrl + "/")
})

test("a shared import locks an open upgrade menu against keyboard input", async ({ page }) => {
    await controlWorker(page)
    await page.goto(plannerUrl)
    const upgrade = page.getByRole("button", { name: "Castle upgrade", exact: true })
    await upgrade.press("ArrowDown")
    await expect(page.getByRole("menuitem").first()).toBeFocused()

    const hash = new URL(createShareableLink(plannerUrl, "light", initialGameProfile, [])).hash
    await page.evaluate(hash => { location.hash = hash }, hash)
    await expect(planner(page)).toHaveAttribute("aria-busy", "true")
    const menu = page.getByRole("menu", { name: "Castle upgrades" })
    await expect.poll(() => menu.evaluate(element => element.contains(document.activeElement))).toBe(false)
    await page.keyboard.press("Enter")
    await page.keyboard.press("Escape")
    await releaseWorker(page)
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await expect(menu).toBeVisible()
    await expect(page.locator(".sortable-order li")).toHaveCount(0)
})

test("an earlier shared import preserves the validation error from a newer link", async ({ page }) => {
    await controlWorker(page)
    const link = createShareableLink(plannerUrl, "dark", initialGameProfile, [])
    await page.goto(link)
    await expect(planner(page)).toHaveAttribute("aria-busy", "true")
    await page.evaluate(() => { location.hash = "build=invalid" })
    await expect(page.locator(".file-notice-error")).toContainText("Unsupported shareable link version.")
    await releaseWorker(page)
    await expect(planner(page)).toHaveAttribute("aria-busy", "false")
    await expect(page.locator(".factions .selected")).toHaveText("Dark")
    await expect(page.getByRole("alert")).toContainText("Unsupported shareable link version.")
    await expect(page.getByRole("status")).toHaveCount(0)
})
