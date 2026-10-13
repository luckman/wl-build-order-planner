import { fireEvent, render, screen, within } from "@testing-library/react"
import App from "./App"
import { createShareableLink } from "./game/shareableLink"
import { initialGameProfile } from "./game/gameProfile"
import { draftStorageKey } from "./game/draftStorage"

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

function chooseUpgrade(name: string) {
    const trigger = screen.getByRole("button", { name: `${name.split(" lvl ")[0]} upgrade` })
    if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger)
    fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(`^${name} `) }))
}

test("opening upgrade cards adds nothing and selecting a higher level inserts prerequisites for either faction", () => {
    render(<App />)
    const castle = screen.getByRole("button", { name: "Castle upgrade" })
    fireEvent.click(castle)
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull()
    chooseUpgrade("Castle lvl 3")
    expect(screen.getByRole("button", { name: "Remove Castle lvl 2" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Remove Castle lvl 3" })).toBeTruthy()
    expect(castle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("menu")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(screen.queryByRole("button", { name: "Castle upgrade" })).toBeNull()
    expect(screen.getAllByRole("button", { name: "Citadel upgrade" })).toHaveLength(1)
    chooseUpgrade("Citadel lvl 2")
    expect(screen.getByRole("button", { name: "Remove Citadel lvl 2" })).toBeTruthy()
})

test("faction drafts survive switching and Clear only clears the selected draft", () => {
    const { container } = render(<App />)
    const actions = within(container.querySelector(".action-panel") as HTMLElement)
    fireEvent.click(actions.getByRole("button", { name: /^Worker / }))
    fireEvent.click(actions.getByRole("button", { name: /^Farm / }))
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect(screen.getByRole("button", { name: "Remove Worker" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(screen.queryByRole("button", { name: "Remove Worker" })).toBeNull()
    fireEvent.click(actions.getByRole("button", { name: /^Slave / }))
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect(screen.getAllByRole("button", { name: /^Remove / }).map(button => button.getAttribute("aria-label")))
        .toEqual(["Remove Worker", "Remove Farm"])
    expect(screen.getByRole("button", { name: "Remove Worker" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Remove Farm" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Remove Slave" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(screen.getByRole("button", { name: "Remove Slave" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect(screen.queryByRole("button", { name: "Remove Worker" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Remove Farm" })).toBeNull()
})

test("upgrade menus support keyboard navigation, focus return, outside dismissal and faction switching", () => {
    render(<App />)
    const trigger = screen.getByRole("button", { name: "Castle upgrade" })
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    const options = screen.getAllByRole("menuitem")
    expect(document.activeElement).toBe(options[0])
    fireEvent.keyDown(options[0], { key: "ArrowDown" })
    expect(document.activeElement).toBe(options[1])
    fireEvent.keyDown(options[1], { key: "End" })
    expect(document.activeElement).toBe(options[options.length - 1])
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole("menu")).toBeNull()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(screen.queryByRole("menu")).toBeNull()
})

test("shared imports replace their faction draft and preserve the other draft", () => {
    const { container } = render(<App />)
    const actions = within(container.querySelector(".action-panel") as HTMLElement)
    fireEvent.click(actions.getByRole("button", { name: /^Worker / }))
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    fireEvent.click(actions.getByRole("button", { name: /^Slave / }))
    try {
        window.history.replaceState(null, "", createShareableLink(window.location.href, "dark", initialGameProfile, []))
        fireEvent(window, new Event("hashchange"))
        expect(screen.queryByRole("button", { name: "Remove Slave" })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Light" }))
        expect(screen.getByRole("button", { name: "Remove Worker" })).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Dark" }))
        expect(screen.queryByRole("button", { name: "Remove Slave" })).toBeNull()
    } finally {
        window.history.replaceState(null, "", window.location.pathname)
    }
})

test("resource-blocked orders are highlighted in both panels and clear when resources are available", () => {
    window.localStorage.setItem(draftStorageKey("light"), JSON.stringify([{ type: "allocate-workers", goldWorkers: 5 }]))
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "0" } })
    fireEvent.click(within(container.querySelector(".action-panel") as HTMLElement).getByRole("button", { name: /^Barracks \d/ }))
    const row = screen.getByRole("button", { name: "Remove Barracks" }).closest("li")!
    expect(row.classList.contains("order-blocked")).toBe(true)
    expect(within(row).queryByText("Blocked")).toBeNull()
    const warning = screen.getByRole("region", { name: "Blocked actions" })
    expect(within(warning).getByText("1 blocked action")).toBeTruthy()
    expect(within(warning).getByText("#1 Barracks — Blocked")).toBeTruthy()
    expect(within(warning).getByText("Waiting for resources, food, producer, or worker")).toBeTruthy()
    expect(container.querySelector(".event.building")).toBeNull()
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    expect(row.classList.contains("order-blocked")).toBe(false)
    expect(within(row).queryByText("Blocked")).toBeNull()
    expect(screen.queryByRole("region", { name: "Blocked actions" })).toBeNull()
    expect(container.querySelector(".event.building")).toBeTruthy()
})

test("food shortages explain the required and available food in both warning locations", () => {
    const { container } = render(<App />)
    const actions = within(container.querySelector(".action-panel") as HTMLElement)
    for (let i = 0; i < 6; i++) fireEvent.click(actions.getByRole("button", { name: /^Worker / }))
    const row = screen.getAllByRole("button", { name: "Remove Worker" })[5].closest("li")!
    const reason = "Insufficient supply: requires 2, available 0 (20/20 used)"
    expect(within(row).getByText(reason)).toBeTruthy()
    expect(within(screen.getByRole("region", { name: "Blocked actions" })).getByText(reason)).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Base food limit"), { target: { value: "22" } })
    expect(row.classList.contains("order-blocked")).toBe(false)
    expect(screen.queryByRole("region", { name: "Blocked actions" })).toBeNull()
})

test("main worker slider selects one to four gold miners and retains it within its faction and advanced changes", () => {
    const { container } = render(<App />)
    const slider = screen.getByRole("slider", { name: "Initial gold miners" }) as HTMLInputElement
    expect(slider.min).toBe("1")
    expect(slider.max).toBe("4")
    expect(slider.step).toBe("1")
    expect(slider.closest("#advanced-profile")).toBeNull()
    for (let gold = 1; gold <= 4; gold++) {
        fireEvent.change(slider, { target: { value: String(gold) } })
        expect(slider.value).toBe(String(gold))
        expect(slider.getAttribute("aria-valuetext")).toBe(`${gold} gold miners, ${5 - gold} wood gatherers`)
        expect(screen.getByText(`Initial gold miners: ${gold} · Initial wood gatherers: ${5 - gold}`)).toBeTruthy()
        expect(container.querySelector(".resource-legend")!.textContent).toContain("10 / 20")
    }
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect(screen.queryByRole("spinbutton", { name: "Initial gold miners" })).toBeNull()
    expect(screen.queryByLabelText("Initial wood gatherers")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Hide advanced" }))
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(slider.value).toBe("4")
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect(slider.value).toBe("4")
    expect(screen.getByText("Initial gold miners: 4 · Initial wood gatherers: 1")).toBeTruthy()
})

test("action cards expose hover costs and group upgrades in dropdown cards", () => {
    const { container } = render(<App />)
    const actions = within(container.querySelector(".action-panel") as HTMLElement)
    expect(actions.getByRole("heading", { name: "Actions" })).toBeTruthy()
    expect(screen.queryByText("Economy timeline")).toBeNull()
    expect(screen.queryByText("Light build order")).toBeNull()
    expect(actions.queryByText("Click to add")).toBeNull()
    const castle = actions.getByRole("button", { name: /^Castle 500 gold/ })
    const worker = actions.getByRole("button", { name: /^Worker / })
    const upgrade = actions.getByRole("button", { name: "Castle upgrade" })
    expect(castle.querySelector(".action-name")).toBeNull()
    expect(worker.querySelector(".action-name")).toBeNull()
    expect(upgrade.querySelector(".action-name")?.textContent).toBe("Upgrade")
    expect(upgrade.querySelector(".action-stat")).toBeNull()
    expect(actions.queryByRole("button", { name: /Castle lvl/ })).toBeNull()
    expect(screen.queryByRole("menuitem")).toBeNull()
    fireEvent.click(upgrade)
    expect(screen.getByRole("menuitem", { name: "Castle lvl 2 200 gold · 200 wood · 0 food" })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    expect(within(castle).getByText("500/500/0")).toBeTruthy()
    expect(within(worker).getByText("150/0/2")).toBeTruthy()
    expect(within(castle).queryByText("60s")).toBeNull()
    expect(within(worker).queryByText("17.82s")).toBeNull()
    expect(within(upgrade).queryByText("45s")).toBeNull()
    expect(castle.title).toBe("Castle\nGold: 500\nWood: 500\nFood: 0\nTime: 60s")
    expect(worker.title).toContain("Food: 2")
    expect(worker.title).toContain("Time: 17.82s")
    for (const group of Array.from(container.querySelectorAll(".action-groups > section")).slice(0, 3)) {
        expect(group.querySelector(".action-name")).toBeNull()
    }
})

test("timeline shows a 120-second window and extends 30 seconds past the last completion", () => {
    const { container } = render(<App />)
    const canvas = container.querySelector(".timeline-canvas") as HTMLElement
    expect(canvas.style.width).toBe("100%")
    expect(within(container.querySelector(".time-scale") as HTMLElement).getByText("2:00")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "100000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "100000" } })
    const actions = within(container.querySelector(".action-panel") as HTMLElement)
    chooseUpgrade("Castle lvl 2")
    expect(canvas.style.width).toBe("100%")
    chooseUpgrade("Castle lvl 3")
    const finishes = Array.from(container.querySelectorAll(".queue-track .event"))
        .map(event => event.getAttribute("title")!.match(/finish (\d+):(\d+(?:\.\d+)?)/)!)
        .map(match => Number(match[1]) * 60 + Number(match[2]))
    const horizon = Math.max(...finishes) + 30
    expect(horizon).toBeGreaterThan(120)
    expect(parseFloat(canvas.style.width)).toBeCloseTo(horizon / 120 * 100)
})

test("player levels default to one and edits stay within integer levels 1–24", () => {
    render(<App />)
    for (const label of ["Castle level", "Sawmill level", "Farm level", "Tower of Mana level", "Barracks level", "Factory level", "Sanctuary level", "Worker level"]) {
        const input = screen.getByLabelText(label) as HTMLInputElement
        expect(input.value).toBe("1")
        expect(input.min).toBe("1")
        expect(input.max).toBe("24")
        fireEvent.change(input, { target: { value: "25" } })
        expect(input.value).toBe("24")
        fireEvent.change(input, { target: { value: "5.8" } })
        expect(input.value).toBe("5")
        fireEvent.change(input, { target: { value: "0" } })
        expect(input.value).toBe("1")
    }
    for (const label of ["Gold per trip", "Wood per trip", "Food per Farm"]) {
        expect(screen.queryByLabelText(label)).toBeNull()
    }
    expect(screen.getByText(/Gold per trip: 50 · Wood per trip: 50 · Food per Farm: 20/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Castle level"), { target: { value: "21" } })
    fireEvent.change(screen.getByLabelText("Sawmill level"), { target: { value: "9" } })
    fireEvent.change(screen.getByLabelText("Farm level"), { target: { value: "5" } })
    expect(screen.getByText(/Gold per trip: 55 · Wood per trip: 52 · Food per Farm: 21/)).toBeTruthy()
    expect(screen.getByRole("button", { name: /Worker.*16.92s/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Worker level"), { target: { value: "21" } })
    expect(screen.getByRole("button", { name: /Barracks.*28.5s/ })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect((screen.getByLabelText("Citadel level") as HTMLInputElement).value).toBe("1")
    expect((screen.getByLabelText("Pigsty level") as HTMLInputElement).value).toBe("1")
    expect(screen.getByLabelText("Workshop level")).toBeTruthy()
    expect(screen.getByLabelText("Dark Gate level")).toBeTruthy()
    expect((screen.getByLabelText("Slave level") as HTMLInputElement).value).toBe("1")
    expect(screen.getByText(/Gold per trip: 50 · Wood per trip: 50 · Food per Pigsty: 20/)).toBeTruthy()
    expect(screen.queryByLabelText("Castle level")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect((screen.getByLabelText("Castle level") as HTMLInputElement).value).toBe("21")
})

test("resource collection follows the timeline and advanced settings retain edits when hidden", () => {
    const { container } = render(<App />)
    const panels = Array.from(container.querySelectorAll(".planner-area > section"))
    expect(panels[0].classList.contains("action-panel")).toBe(true)
    expect(panels[1].classList.contains("timeline")).toBe(true)
    expect(panels[2].classList.contains("economy")).toBe(true)
    expect(container.querySelector(".workspace > .action-panel")).toBeNull()
    expect((screen.getByLabelText("Starting wood") as HTMLInputElement).value).toBe("50")
    expect(screen.getByRole("slider", { name: "Initial gold miners" })).toBeTruthy()
    expect(screen.getByText("Initial gold miners: 4 · Initial wood gatherers: 1")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    fireEvent.change(screen.getByLabelText("Initial gold miners"), { target: { value: "3" } })
    expect(screen.getByLabelText("Order delay (seconds)")).toBeTruthy()
    expect(screen.queryByLabelText("Gold gathering time (seconds)")).toBeNull()
    expect(screen.queryByLabelText("Initial gold travel reduction (seconds)")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Hide advanced" }))
    expect(screen.getByRole("slider", { name: "Initial gold miners" })).toBeTruthy()
    expect(screen.getByText("Initial gold miners: 3 · Initial wood gatherers: 2")).toBeTruthy()
    expect(screen.getByLabelText("Starting gold")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("3")
})

test("Miriel appears in the heroes row, consumes food, and removing her releases the recruitment limit", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "100000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "100000" } })
    const hero = within(screen.getByRole("region", { name: "heroes" })).getByRole("button", { name: /Miriel/ })
    fireEvent.click(hero)
    const summary = container.querySelector(".resource-summary") as HTMLElement
    expect(within(summary).getByText("20 / 40")).toBeTruthy()
    expect(Array.from(container.querySelectorAll(".queue-label")).some(label => label.textContent === "Altar of Heroes")).toBe(true)
    expect(container.querySelector(".event.hero")).toBeTruthy()
    fireEvent.click(hero)
    expect(screen.getByRole("alert").textContent).toContain("Miriel limit reached")
    fireEvent.click(screen.getByRole("button", { name: "Remove Miriel" }))
    fireEvent.click(hero)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getAllByRole("button", { name: "Remove Miriel" })).toHaveLength(1)
})

test("duplicate upgrades are rejected until another Castle is explicitly added", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "100000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "100000" } })
    const actions = within(container.querySelector(".action-panel") as HTMLElement)
    chooseUpgrade("Castle lvl 2")
    chooseUpgrade("Castle lvl 2")
    expect(screen.getByRole("alert").textContent).toBe("Requires another Castle")
    const order = container.querySelector(".order") as HTMLElement
    expect(within(order).getAllByText("Castle lvl 2")).toHaveLength(1)
    fireEvent.click(actions.getByRole("button", { name: /^Castle 500 gold/ }))
    chooseUpgrade("Castle lvl 2")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(within(order).getAllByText("Castle lvl 2")).toHaveLength(2)
})

test("adding a second Farm inserts the needed upgrade and removal explains blocked orders", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "100000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "100000" } })
    const actions = within(container.querySelector(".action-panel") as HTMLElement)
    const farm = actions.getByRole("button", { name: /^Farm/ })
    fireEvent.click(farm)
    fireEvent.click(farm)
    const order = container.querySelector(".order") as HTMLElement
    expect(within(order).getAllByText("Farm")).toHaveLength(2)
    expect(within(order).getByText("Castle lvl 2")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Remove Castle lvl 2" }))
    expect(within(order).getByText("Farm limit reached at the current town-hall level")).toBeTruthy()
    const blockedFarm = Array.from(order.querySelectorAll("li")).find(row => row.textContent?.includes("Farm limit reached"))!
    expect(blockedFarm.title).toBe("Farm limit reached at the current town-hall level")
    expect(blockedFarm.classList.contains("order-blocked")).toBe(true)
    expect(within(blockedFarm).queryByText("Blocked")).toBeNull()
    expect(within(screen.getByRole("region", { name: "Blocked actions" })).getByText("Farm limit reached at the current town-hall level")).toBeTruthy()
})

test("Barracks prices and resource totals update when orders are added or removed", () => {
    window.localStorage.setItem(draftStorageKey("light"), JSON.stringify([{ type: "allocate-workers", goldWorkers: 0 }]))
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    const button = within(container.querySelector(".action-panel") as HTMLElement).getByRole("button", { name: /^Barracks \d/ })
    fireEvent.click(button)
    expect(button.textContent).toContain("400/300/0")
    fireEvent.click(button)
    expect(button.textContent).toContain("800/600/0")
    const summary = container.querySelector(".resource-summary") as HTMLElement
    expect(within(summary).getByText("1400")).toBeTruthy()
    expect(within(summary).getByText("1550")).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "Remove Barracks" })[0])
    expect(button.textContent).toContain("400/300/0")
    expect(within(summary).getAllByText("1800")).toHaveLength(1)
    expect(within(summary).getByText("1850")).toBeTruthy()
})

test.each([
    ["Light", "Worker"],
    ["Dark", "Slave"],
])("%s town hall serializes worker training", (faction, worker) => {
    const { container } = render(<App />)
    if (faction === "Dark") {
        fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    }
    const action = container.querySelector(".action-panel") as HTMLElement
    const addWorker = within(action).getByRole("button", { name: new RegExp(worker) })
    fireEvent.click(addWorker)
    fireEvent.click(addWorker)
    const order = container.querySelector(".order") as HTMLElement
    expect(within(order).getByText("Command 0:01")).toBeTruthy()
    expect(within(order).getByText("Command 0:18.8")).toBeTruthy()
    const rows = Array.from(order.querySelectorAll("li"))
    const events = Array.from(container.querySelectorAll(".event.unit"))
    expect(rows.map(row => row.title)).toEqual(events.map(event => event.getAttribute("title")))
    expect(rows.every(row => !row.title.includes("worker returns"))).toBe(true)
    expect(within(order).queryByText("Command 0:27")).toBeNull()
})

test("Barracks is added before its unit and its training slot is available only after construction", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    const action = container.querySelector(".action-panel") as HTMLElement
    const order = container.querySelector(".order") as HTMLElement
    fireEvent.click(within(action).getByRole("button", { name: /Swordsman/ }))
    expect(within(order).getByText("Barracks")).toBeTruthy()
    fireEvent.click(within(action).getByRole("button", { name: /Swordsman/ }))
    expect(within(order).getByText("Command 0:36")).toBeTruthy()
    expect(within(order).getByText("Command 0:56.8")).toBeTruthy()
})

test("two completed Barracks have independent training slots", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    const action = container.querySelector(".action-panel") as HTMLElement
    for (const name of [/^Barracks \d/, /^Barracks \d/, /Swordsman/, /Swordsman/]) {
        fireEvent.click(within(action).getByRole("button", { name }))
    }
    const order = container.querySelector(".order") as HTMLElement
    expect(within(order).getAllByText("Command 0:36")).toHaveLength(2)
})

test("initial allocations derive food, and hovering reads exact delivery boundaries", () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("4")
    expect(screen.getByText("Initial gold miners: 4 · Initial wood gatherers: 1")).toBeTruthy()
    expect(screen.queryByLabelText("Workers available")).toBeNull()
    expect(screen.queryByLabelText("Initial food used")).toBeNull()
    const chart = container.querySelector(".resource-chart") as HTMLElement
    jest.spyOn(chart, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1200 } as DOMRect)
    fireEvent.mouseMove(chart, { clientX: 100 })
    expect(within(screen.getByRole("tooltip")).getByText("0:10.0")).toBeTruthy()
    expect(within(screen.getByRole("tooltip")).getByText("Gold: 150")).toBeTruthy()
    expect(within(screen.getByRole("tooltip")).getByText("Wood: 50")).toBeTruthy()
    expect(within(screen.getByRole("tooltip")).getByText("Food: 10/20")).toBeTruthy()
    fireEvent.mouseMove(chart, { clientX: 101 })
    expect(within(screen.getByRole("tooltip")).getByText("0:10.1")).toBeTruthy()
    expect(within(screen.getByRole("tooltip")).getByText("Gold: 200")).toBeTruthy()
    expect(container.querySelectorAll(".hover-line").length).toBe(2)
    fireEvent.mouseLeave(chart)
    expect(screen.queryByRole("tooltip")).toBeNull()
    fireEvent.change(screen.getByLabelText("Initial gold miners"), { target: { value: "3" } })
    fireEvent.mouseMove(chart, { clientX: 0 })
    expect(within(screen.getByRole("tooltip")).getByText("Food: 10/20")).toBeTruthy()
})

test("latest-command markers stay inside graphs during hover while amounts follow the cursor", () => {
    const { container } = render(<App />)
    expect(container.querySelector(".latest-command-line")).toBeNull()
    expect(container.querySelector(".latest-command-caption")).toBeNull()
    const worker = within(container.querySelector(".action-panel") as HTMLElement).getByRole("button", { name: /^Worker / })
    fireEvent.click(worker)
    fireEvent.click(worker)

    const values = () => Array.from(container.querySelectorAll(".resource-legend .resource-value"), value => value.textContent)
    const snapshot = container.querySelector(".resource-summary") as HTMLElement
    const snapshotValue = (label: string) => Array.from(snapshot.querySelectorAll("span"))
        .find(span => span.textContent?.startsWith(label))!.querySelector("b")!.textContent
    const latestValues = [snapshotValue("Gold"), snapshotValue("Wood"), snapshotValue("Mana"), snapshotValue("Food")]
    expect(values()).toEqual(latestValues)
    const marker = container.querySelector(".latest-command-line") as HTMLElement
    const caption = container.querySelector(".latest-command-caption") as HTMLElement
    const latestTimestamp = caption.textContent
    expect(latestTimestamp).toBeTruthy()
    expect(container.querySelectorAll(".latest-command-line")).toHaveLength(2)
    container.querySelectorAll(".latest-command-line").forEach(line => {
        expect(line.parentElement?.classList.contains("resource-chart")).toBe(true)
        expect((line as HTMLElement).style.left).toBe(marker.style.left)
    })
    const events = container.querySelectorAll<HTMLElement>(".event.unit")
    expect(marker.style.left).toBe(events[events.length - 1].style.left)
    expect(screen.queryByRole("tooltip")).toBeNull()

    const chart = container.querySelector(".resource-chart") as HTMLElement
    jest.spyOn(chart, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1200 } as DOMRect)
    fireEvent.mouseMove(chart, { clientX: 1000 })
    expect(container.querySelectorAll(".latest-command-line")).toHaveLength(2)
    expect((container.querySelector(".latest-command-line") as HTMLElement).style.left).toBe(marker.style.left)
    expect(container.querySelectorAll(".hover-line")).toHaveLength(2)
    expect(within(screen.getByRole("tooltip")).getByText("1:40.0")).toBeTruthy()
    expect(values()).not.toEqual(latestValues)
    expect(caption.textContent).toBe(latestTimestamp)

    fireEvent.mouseLeave(chart)
    expect(values()).toEqual(latestValues)
    expect((container.querySelector(".latest-command-line") as HTMLElement).style.left).toBe(marker.style.left)
    expect(screen.queryByRole("tooltip")).toBeNull()
    fireEvent.click(screen.getAllByRole("button", { name: "Remove Worker" })[1])
    expect((container.querySelector(".latest-command-line") as HTMLElement).style.left)
        .toBe((container.querySelector(".event.unit") as HTMLElement).style.left)
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(container.querySelector(".latest-command-line")).toBeNull()
    expect(container.querySelector(".latest-command-caption")).toBeNull()
})

test("the editable construction delay changes building and worker return times", () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    const delay = screen.getByLabelText("Construction start delay (seconds)") as HTMLInputElement
    expect(delay.value).toBe("4")
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    fireEvent.click(
        within(container.querySelector(".action-panel") as HTMLElement).getByRole("button", { name: /^Barracks \d/ }),
    )
    expect(screen.getAllByTitle("Command 0:01 · start 0:05 · finish 0:35 · worker returns 0:39")).toHaveLength(2)
    fireEvent.change(delay, { target: { value: "2.5" } })
    expect(screen.getAllByTitle("Command 0:01 · start 0:03.5 · finish 0:33.5 · worker returns 0:36")).toHaveLength(2)
})

test("town hall upgrades show builder travel and return time in the construction timeline", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    chooseUpgrade("Castle lvl 2")

    expect(container.querySelector(".event.upgrade")?.getAttribute("title")).toBe(
        "Command 0:36 · start 0:40 · finish 1:25 · worker returns 1:29",
    )
    const upgradeRow = screen.getByRole("button", { name: "Remove Castle lvl 2" }).closest("li")!
    expect(upgradeRow.title).toBe(container.querySelector(".event.upgrade")?.getAttribute("title"))
})
