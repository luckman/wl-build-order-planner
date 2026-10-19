import { expect, test } from "@playwright/test"
import { serializeBuildOrder } from "../src/game/buildOrderFile"
import { initialGameProfile } from "../src/game/gameProfile"

test("Reset all restores main and hidden advanced settings without clearing orders", async ({ page }) => {
    await page.goto("http://localhost:2987")
    await page.getByLabel("Starting gold", { exact: true }).fill("2000")
    await page.locator(".action-panel").getByRole("button", { name: /^Worker / }).click()
    await page.getByRole("button", { name: /^Advanced/ }).click()
    await page.getByRole("spinbutton", { name: "Gold travel time (seconds each way)", exact: true }).fill("8")
    await page.getByRole("spinbutton", { name: "Order delay (seconds)", exact: true }).fill("3")
    await page.getByRole("button", { name: "Hide advanced" }).click()
    await page.getByRole("button", { name: "Reset all" }).click()
    await expect(page.getByLabel("Starting gold", { exact: true })).toHaveValue("150")
    await expect(page.getByLabel("Starting wood", { exact: true })).toHaveValue("50")
    await expect(page.getByRole("slider", { name: "Initial gold miners" })).toHaveValue("4")
    await expect(page.getByRole("button", { name: "Remove Worker" })).toHaveCount(1)
    await page.getByRole("button", { name: /^Advanced/ }).click()
    await expect(page.getByRole("spinbutton", { name: "Gold travel time (seconds each way)", exact: true })).toHaveValue("4.25")
    await expect(page.getByRole("spinbutton", { name: "Order delay (seconds)", exact: true })).toHaveValue("1")
})

test("blocked actions use red order rows and a prominent timeline warning, clearing when resolved", async ({ page }) => {
    // Imported allocations allow five gold miners, leaving no wood income.
    const draft = serializeBuildOrder("light", {
        ...initialGameProfile,
        player: { ...initialGameProfile.player, startingGold: 2000, startingWood: 0 },
    }, [], false, { type: "allocate-workers", goldWorkers: 5 })
    await page.addInitScript(draft => window.localStorage.setItem("wl-build-draft-v2-light", draft), draft)
    await page.goto("http://localhost:2987")
    await expect(page.getByText("Initial gold miners: 5 · Initial wood gatherers: 0")).toBeVisible()
    await page.locator(".action-panel").getByRole("button", { name: /^Barracks \d/ }).click()
    const row = page.locator(".order li").first()
    await expect(row).toHaveClass("order-blocked")
    await expect(row).toHaveCSS("background-color", "rgb(60, 24, 34)")
    const warning = page.getByRole("region", { name: "Blocked actions" })
    await expect(warning).toContainText("#1 Barracks — Blocked")
    await expect(warning).toContainText("Waiting for resources, food, producer, or worker")
    await expect(warning).toHaveCSS("background-color", "rgb(60, 24, 34)")
    const graph = (await page.locator(".timeline-grid").boundingBox())!
    const notice = (await warning.boundingBox())!
    expect(notice.y).toBeGreaterThan(graph.y + graph.height)
    await page.screenshot({ path: "test-results/blocked-actions.png", fullPage: true })
    await page.getByLabel("Starting wood", { exact: true }).fill("2000")
    await expect(row).not.toHaveClass("order-blocked")
    await expect(warning).toHaveCount(0)
    await expect(page.locator(".event.building")).toHaveCount(1)
})

for (const width of [1440, 1024, 390]) {
    test(`actions sit directly above the wider timeline at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto("http://localhost:2987")
        for (const faction of ["Light", "Dark"]) {
            await page.getByRole("button", { name: faction, exact: true }).click()
            const actions = await page.locator(".action-panel").boundingBox()
            const timeline = await page.locator(".timeline").boundingBox()
            const planner = await page.locator(".planner-area").boundingBox()
            expect(actions!.x).toBe(timeline!.x)
            expect(actions!.width).toBe(timeline!.width)
            expect(timeline!.y - (actions!.y + actions!.height)).toBeCloseTo(12, 0)
            const groups = page.locator(".action-groups > section")
            await expect(page.locator(".action-panel").getByRole("heading", { name: "Actions" })).toBeVisible()
            await expect(page.getByText("Economy timeline", { exact: true })).toHaveCount(0)
            await expect(page.getByRole("heading", { name: `${faction} build order` })).toHaveCount(0)
            const switcher = (await page.locator(".factions").boundingBox())!
            const order = (await page.locator(".order").boundingBox())!
            if (width > 1050) {
                expect(actions!.y).toBeCloseTo(switcher.y, 0)
                expect(order.y).toBeGreaterThan(switcher.y + switcher.height)
            } else {
                expect(actions!.y).toBeGreaterThan(switcher.y + switcher.height)
            }
            await expect(groups.locator("h3")).toHaveCount(0)
            expect(await groups.evaluateAll(elements => elements.map(el => el.getAttribute("aria-label"))))
                .toEqual(["buildings", "units", "heroes", "upgrades"])
            for (let index = 0; index < 4; index++) {
                const cards = groups.nth(index).locator(".action")
                const boxes = await cards.evaluateAll(elements => elements.map(el => {
                    const box = el.getBoundingClientRect()
                    return { y: box.y, width: box.width }
                }))
                expect(new Set(boxes.map(box => box.y)).size).toBe(boxes.length ? 1 : 0)
                expect(boxes.map(box => box.width)).toEqual(Array(boxes.length).fill(index === 3 ? 84 : 70))
                if (index !== 3) await expect(groups.nth(index).locator(".action:not(.resource-card) .action-name")).toHaveCount(0)
                else expect(await cards.locator(".action-name").allTextContents())
                    .toEqual(Array(boxes.length).fill("Upgrade"))
            }
            const firstCard = page.locator(".action").first()
            expect((await firstCard.boundingBox())!.height).toBeLessThan(70)
            await expect(firstCard.locator("small")).toHaveText("500/500")
            const icon = (await firstCard.locator("img").boundingBox())!
            const costs = (await firstCard.locator("small").boundingBox())!
            expect(costs.y).toBeGreaterThanOrEqual(icon.y + icon.height)
            const upgrade = groups.nth(3).locator(".action").first()
            await expect(upgrade.locator(".action-name")).toHaveText("Upgrade")
            const townHall = faction === "Light" ? "Castle" : "Citadel"
            await expect(upgrade).toHaveAttribute("title", `${townHall} upgrade`)
            await upgrade.click()
            const menu = page.getByRole("menu", { name: `${townHall} upgrades` })
            await expect(menu.locator(".upgrade-option-name")).toHaveText(
                [2, 3, 4].map(level => `${townHall} lvl ${level}`),
            )
            await expect(menu.locator(".upgrade-option-cost").first()).toHaveText("200 gold · 200 wood")
            const menuBounds = (await menu.boundingBox())!
            expect(menuBounds.x).toBeGreaterThanOrEqual(0)
            expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(width)
            await menu.press("Escape")
            await expect(menu).toHaveCount(0)
            await expect(upgrade).toBeFocused()
            const name = (await upgrade.locator(".action-name").boundingBox())!
            const upgradeIcon = (await upgrade.locator("img").boundingBox())!
            expect(name.y + name.height).toBeLessThanOrEqual(upgradeIcon.y)
            await firstCard.hover()
            await expect(firstCard).toHaveAttribute("title", `${faction === "Light" ? "Castle" : "Citadel"}\nGold: 500\nWood: 500\nTime: 60s`)
            if (width > 700) expect(timeline!.width).toBe(planner!.width)
            else {
                // Mobile uses display: contents so the order can sit before resources.
                expect(await page.locator(".planner-area").evaluate(el => getComputedStyle(el).display)).toBe("contents")
                expect(timeline!.width).toBe((await page.locator(".workspace").boundingBox())!.width)
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
            await expect(page.locator(".timeline").getByRole("heading", { name: "Timeline", exact: true })).toBeVisible()
            if (faction === "Light") {
                await page.screenshot({ path: `test-results/layout-${width}.png`, fullPage: true })
            }
            const chart = await page.locator(".timeline-scroll").evaluate(el => ({
                visible: el.clientWidth, total: el.scrollWidth,
            }))
            expect(chart.total).toBe(chart.visible)
            // The last card must remain reachable within the action strip.
            const lastAction = page.locator(".action-panel .action").last()
            await lastAction.scrollIntoViewIfNeeded()
            await expect(lastAction).toBeInViewport()
            // Use a recruit with no missing prerequisites to verify adding from the strip.
            await page.locator(".action-panel").getByRole("button", {
                name: faction === "Light" ? /^Worker / : /^Slave /,
            }).click()
            await expect(page.locator(".order li").first()).toBeVisible()
        }
        const order = await page.locator(".order").boundingBox()
        const timeline = await page.locator(".timeline").boundingBox()
        if (width > 1050) expect(order!.x).toBeGreaterThanOrEqual(timeline!.x + timeline!.width)
        else expect(order!.y).toBeGreaterThan(timeline!.y + timeline!.height)
    })
}

test("120-second graph scale, hover boundaries, and fixed columns survive horizontal scrolling", async ({ page }) => {
    await page.goto("http://localhost:2987")
    const chart = page.locator(".resource-chart").first()
    await chart.scrollIntoViewIfNeeded()
    const bounds = (await chart.boundingBox())!
    await page.mouse.move(bounds.x + bounds.width / 12, bounds.y + 20)
    await expect(page.getByRole("tooltip")).toContainText("0:10.0")
    await expect(page.getByRole("tooltip")).toContainText("Gold: 150")
    // Browser mouse coordinates round to pixels; use the next pixel past 10 seconds.
    await page.mouse.move(Math.ceil(bounds.x + bounds.width * (10.1 / 120)), bounds.y + 20)
    await expect(page.getByRole("tooltip")).toContainText("0:10.1")
    await expect(page.getByRole("tooltip")).toContainText("Gold: 150")
    // The first delivery is at 10.6s: 4.25s each way + 3.1s gathering - 1s opening reduction.
    await page.mouse.move(Math.ceil(bounds.x + bounds.width * (10.7 / 120)), bounds.y + 20)
    await expect(page.getByRole("tooltip")).toContainText("0:10.7")
    await expect(page.getByRole("tooltip")).toContainText("Gold: 200")
    await page.getByLabel("Starting gold", { exact: true }).fill("100000")
    await page.getByLabel("Starting wood", { exact: true }).fill("100000")
    await page.getByRole("button", { name: "Castle upgrade", exact: true }).click()
    await page.getByRole("menuitem", { name: /^Castle lvl 3 / }).click()
    const labels = await page.locator(".timeline-legend").boundingBox()
    const values = await page.locator(".resource-legend").boundingBox()
    const scroll = page.locator(".timeline-scroll")
    const dimensions = await scroll.evaluate(el => ({ visible: el.clientWidth, total: el.scrollWidth }))
    expect(dimensions.total).toBeGreaterThan(dimensions.visible)
    await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth })
    expect(await scroll.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
    expect(await page.locator(".timeline-legend").boundingBox()).toEqual(labels)
    expect(await page.locator(".resource-legend").boundingBox()).toEqual(values)
    await page.mouse.move(0, 0)
    await expect(page.getByRole("tooltip")).toHaveCount(0)
})

test("resource collection has three columns and the fixed opening action supports keyboard allocation and reload", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto("http://localhost:2987")
    const grid = page.locator(".profile-blocks > .economy-grid")
    expect(await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(3)
    await expect(grid.locator(".resource-profile-column")).toHaveCount(3)
    const slider = page.getByRole("slider", { name: "Initial gold miners" })
    await expect(page.locator(".economy").getByRole("slider")).toHaveCount(0)
    await expect(page.getByLabel("Starting workers", { exact: true })).toHaveCount(0)
    await expect(slider).toHaveAttribute("max", "4")
    await expect(page.locator(".order").getByRole("slider")).toHaveCount(1)
    await expect(page.getByRole("region", { name: "Opening worker allocation" }).getByRole("button", { name: /Remove|Reorder/ })).toHaveCount(0)
    await slider.scrollIntoViewIfNeeded()
    await expect(slider).toHaveValue("4")
    await expect(page.getByText("Initial gold miners: 4 · Initial wood gatherers: 1")).toBeVisible()
    await slider.focus()
    await slider.press("ArrowLeft")
    await expect(slider).toHaveValue("3")
    await expect(page.getByText("Initial gold miners: 3 · Initial wood gatherers: 2")).toBeVisible()
    await slider.press("Home")
    await expect(slider).toHaveValue("1")
    await expect(page.getByText("Initial gold miners: 1 · Initial wood gatherers: 4")).toBeVisible()
    await slider.press("End")
    await expect(slider).toHaveValue("4")
    await expect(page.getByText("Initial gold miners: 4 · Initial wood gatherers: 1")).toBeVisible()
    await page.getByRole("button", { name: /^Advanced/ }).click()
    const advancedGrids = page.locator("#advanced-profile .resource-profile-grid")
    await expect(advancedGrids).toHaveCount(2)
    for (const advancedGrid of await advancedGrids.all()) {
        expect(await advancedGrid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(3)
    }
    await expect(page.getByRole("spinbutton", { name: "Gold travel time (seconds each way)", exact: true })).toBeVisible()
    await expect(page.getByRole("spinbutton", { name: "Order delay (seconds)", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Hide advanced" }).click()
    await expect(slider).toBeVisible()
    await expect(slider).toHaveValue("4")
    await page.locator(".action-panel").getByRole("button", { name: /^Worker \d/ }).click()
    await page.getByRole("button", { name: "Reset all" }).click()
    await expect(slider).toHaveValue("4")
    await page.reload()
    await expect(slider).toHaveValue("4")
    await expect(page.getByRole("button", { name: "Remove Worker" })).toBeVisible()
    await page.screenshot({ path: "test-results/opening-worker-allocation.png", fullPage: true })
})

test("Build order action hover details match timeline timing and update with construction delay", async ({ page }) => {
    await page.goto("http://localhost:2987")
    await page.getByLabel("Starting gold", { exact: true }).fill("2000")
    await page.getByLabel("Starting wood", { exact: true }).fill("2000")
    await page.getByRole("button", { name: "Castle upgrade", exact: true }).click()
    await page.getByRole("menuitem", { name: /^Castle lvl 2 / }).click()
    const row = page.locator(".order li").filter({ has: page.getByRole("button", { name: "Remove Castle lvl 2" }) })
    const timeline = page.locator(".event.upgrade")
    await row.hover()
    await expect(row).toHaveAttribute("title", "Command 0:35 · start 0:38 · finish 1:23 · worker returns 1:26")
    expect(await row.getAttribute("title")).toBe(await timeline.getAttribute("title"))
    await page.getByRole("button", { name: /^Advanced/ }).click()
    await page.getByRole("spinbutton", { name: "Construction start delay (seconds)", exact: true }).fill("2.5")
    await row.hover()
    expect(await row.getAttribute("title")).toBe(await timeline.getAttribute("title"))
    // The inserted Barracks prerequisite also completes 0.5 seconds earlier.
    await expect(row).toHaveAttribute("title", "Command 0:34.5 · start 0:37 · finish 1:22 · worker returns 1:24.5")
})
