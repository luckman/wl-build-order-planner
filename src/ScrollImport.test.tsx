import { fireEvent, render, screen, within } from "@testing-library/react"
import App from "./App"
import ScrollDialog from "./ScrollDialog"
import { createScrollAction } from "./game/scrolls"
import { factions } from "./game/gameData"
import { economyFromProfile, initialGameProfile } from "./game/gameProfile"
import { simulateBuildOrder } from "./game/buildSimulation"
import { createShareableLink } from "./game/shareableLink"

beforeEach(() => window.localStorage.clear())
afterEach(() => {
    window.localStorage.clear()
    window.history.replaceState(null, "", window.location.pathname)
})

test("Lumber Gathering uses its own affordability, supports timestamp editing, and persists", () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: /^Lumber Gathering 25 mana/ }))
    const dialog = within(screen.getByRole("dialog", { name: "Use Lumber Gathering" }))
    expect(dialog.getByText(/25 mana.*15 wood/)).toBeTruthy()
    expect((dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement).value).toBe("00:01")
    fireEvent.click(dialog.getByRole("button", { name: "Add scroll" }))
    expect(container.querySelector("button.event.scroll")?.getAttribute("title")).toContain("start 0:02")
    expect(screen.getByRole("button", { name: "Remove Lumber Gathering" })).toBeTruthy()
    const draft = JSON.parse(window.localStorage.getItem("wl-build-draft-v2-light")!).buildOrder
    expect(draft[1]).toMatchObject({ scrollId: "lumber-gathering", commandTime: 1 })
    fireEvent.click(screen.getByRole("button", { name: "Change Lumber Gathering timestamp, action 1" }))
    const editor = within(screen.getByRole("dialog"))
    fireEvent.change(editor.getByLabelText("Command time (mm:ss)"), { target: { value: "00:05" } })
    fireEvent.click(editor.getByRole("button", { name: "Save timestamp" }))
    expect(container.querySelector(".order li")?.textContent).toContain("Command 0:05")
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(screen.queryByRole("button", { name: /^Lumber Gathering 25 mana/ })).toBeNull()
})

test.each(["215", "0215", "02:15"])("keyboard time %s normalizes to 02:15 and stores 135 seconds", text => {
    const onAdd = jest.fn()
    render(<ScrollDialog minimumTime={0} automaticTime={91} onAdd={onAdd} onClose={() => {}} />)
    fireEvent.click(screen.getByRole("checkbox"))
    const input = screen.getByLabelText("Command time (mm:ss)") as HTMLInputElement
    fireEvent.change(input, { target: { value: text } })
    expect(input.value).toBe("02:15")
    fireEvent.blur(input)
    expect(input.value).toBe("02:15")
    fireEvent.click(screen.getByRole("button", { name: "Add scroll" }))
    expect(onAdd).toHaveBeenCalledWith(135)
})

test("command time caps larger keyboard and pasted values at 29:59", () => {
    const onAdd = jest.fn()
    render(<ScrollDialog minimumTime={0} automaticTime={91} onAdd={onAdd} onClose={() => {}} />)
    fireEvent.click(screen.getByRole("checkbox"))
    const input = screen.getByLabelText("Command time (mm:ss)") as HTMLInputElement
    const add = screen.getByRole("button", { name: "Add scroll" }) as HTMLButtonElement
    for (const value of ["10000", "100:00", "29:59.001"]) {
        fireEvent.change(input, { target: { value } })
        expect(input.value).toBe("29:59")
        expect(add.disabled).toBe(false)
    }
    fireEvent.change(input, { target: { value: "9959" } })
    expect(add.disabled).toBe(false)
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalledWith(1799)
})

test("shared scroll commands appear chronologically after recruitment lanes and remove the correct row", () => {
    const worker = factions.light.items.find(item => item.id === "worker")!
    const scroll = createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime: 5 }, "light")
    const profile = { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 2000, startingMana: 50 } }
    const economy = economyFromProfile(profile)
    const plan = simulateBuildOrder([worker, worker, scroll], economy, 10, 20, economy.foodPerFarm, "Castle").plan
    window.history.replaceState(null, "", createShareableLink(window.location.href, "light", profile, plan))
    const { container } = render(<App />)
    const order = container.querySelector(".sortable-order") as HTMLElement
    expect(Array.from(order.querySelectorAll("li b")).map(element => element.textContent)).toEqual(["Worker", "Gold Rush", "Worker"])
    expect(screen.getByText("Scrolls and events")).toBeTruthy()
    const timelineScroll = container.querySelector("button.event.scroll") as HTMLElement
    expect(timelineScroll.title).toContain("start 0:06")
    fireEvent.click(timelineScroll)
    expect(within(order).getAllByRole("button", { name: "Remove Worker" })).toHaveLength(2)
    expect(within(order).queryByRole("button", { name: "Remove Gold Rush" })).toBeNull()
})

test("insufficient-mana scroll stays editable with a warning and has no active timeline bar", () => {
    const scroll = createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime: 0 }, "light")
    const plan = simulateBuildOrder([scroll], economyFromProfile(initialGameProfile), 10, 20, 20, "Castle").plan
    window.history.replaceState(null, "", createShareableLink(window.location.href, "light", initialGameProfile, plan))
    const { container } = render(<App />)
    expect(screen.getByRole("button", { name: "Remove Gold Rush" })).toBeTruthy()
    expect(container.querySelector(".order-blocked")?.textContent).toContain("Insufficient mana")
    expect(container.querySelector("button.event.scroll")).toBeNull()
})

test("Gold Rush shares the heroes row and automatic insertion fixes its timestamp", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Mana accumulation"), { target: { value: "20" } })
    const heroes = within(screen.getByRole("region", { name: "heroes" }))
    fireEvent.click(heroes.getByRole("button", { name: /^Gold Rush/ }))
    const dialog = within(screen.getByRole("dialog", { name: "Use Gold Rush" }))
    expect((dialog.getByRole("checkbox") as HTMLInputElement).checked).toBe(true)
    expect((dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement).disabled).toBe(true)
    expect((dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement).value).toBe("00:46")
    fireEvent.click(dialog.getByRole("button", { name: "Add scroll" }))
    expect(container.querySelector(".order li")?.textContent).toContain("Command 0:46")
    expect(screen.queryByRole("button", { name: /^Reorder Gold Rush/ })).toBeNull()
    expect(container.querySelector(".order li")?.getAttribute("data-rfd-drag-handle-draggable-id")).toBeNull()
    fireEvent.change(screen.getByLabelText("Mana accumulation"), { target: { value: "10" } })
    expect(container.querySelector(".order-blocked")?.textContent).toContain("Insufficient mana")
    const draft = JSON.parse(window.localStorage.getItem("wl-build-draft-v2-light")!).buildOrder
    expect(draft[1].commandTime).toBe(46)
    const profile = JSON.parse(window.localStorage.getItem("wl-build-draft-v2-light")!).gameProfile
    expect(profile.basic.timeBetweenScrolls).toBe(10)
    expect(profile.player.scrollLevel).toBe(1)
    expect(draft[1].level).toBeUndefined()
    expect(screen.queryByLabelText(/time between scrolls/i)).toBeNull()
})

test("cooldown and mana select the next automatic time; manual times have a cooldown minimum", () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText("Starting mana"), { target: { value: "100" } })
    fireEvent.change(screen.getByLabelText("Base mana capacity"), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: /^Gold Rush/ }))
    fireEvent.click(screen.getByRole("button", { name: "Add scroll" }))
    fireEvent.click(screen.getByRole("button", { name: /^Gold Rush/ }))
    const dialog = within(screen.getByRole("dialog"))
    const time = dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement
    expect(time.value).toBe("00:12")
    expect(time.type).toBe("text")
    fireEvent.click(dialog.getByRole("checkbox"))
    expect(time.disabled).toBe(false)
    fireEvent.change(time, { target: { value: "60" } })
    expect((dialog.getByRole("button", { name: "Add scroll" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(time, { target: { value: "9" } })
    expect((dialog.getByRole("button", { name: "Add scroll" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(time, { target: { value: "12" } })
    fireEvent.click(dialog.getByRole("button", { name: "Add scroll" }))
    screen.getByRole("button", { name: /^Gold Rush/ }).focus()
    fireEvent.click(screen.getByRole("button", { name: /^Gold Rush/ }))
    expect((screen.getByLabelText("Command time (mm:ss)") as HTMLInputElement).value).toBe("05:02")
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Gold Rush/ }))
})

test("player cooldown reduction updates the automatic suggestion and manual minimum", () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText("Starting mana"), { target: { value: "100" } })
    fireEvent.change(screen.getByLabelText("Base mana capacity"), { target: { value: "100" } })
    fireEvent.change(screen.getByLabelText("Scroll cooldown reduction (%)"), { target: { value: "5" } })
    fireEvent.click(screen.getByRole("button", { name: /^Gold Rush/ }))
    fireEvent.click(screen.getByRole("button", { name: "Add scroll" }))
    fireEvent.click(screen.getByRole("button", { name: /^Gold Rush/ }))
    const dialog = within(screen.getByRole("dialog"))
    const time = dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement
    expect(time.value).toBe("00:11.5")
    fireEvent.click(dialog.getByRole("checkbox"))
    fireEvent.change(time, { target: { value: "00:11.49" } })
    expect((dialog.getByRole("button", { name: "Add scroll" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(time, { target: { value: "00:11.5" } })
    expect((dialog.getByRole("button", { name: "Add scroll" }) as HTMLButtonElement).disabled).toBe(false)
})

test("manual timestamps can add insufficient-mana commands; cancellation does not add", () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: /^Gold Rush/ }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("button", { name: "Remove Gold Rush" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /^Gold Rush/ }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("checkbox"))
    fireEvent.change(screen.getByLabelText("Command time (mm:ss)"), { target: { value: "1.5" } })
    fireEvent.blur(screen.getByLabelText("Command time (mm:ss)"))
    expect((screen.getByLabelText("Command time (mm:ss)") as HTMLInputElement).value).toBe("00:01.5")
    expect(screen.queryByLabelText("Scroll level")).toBeNull()
    expect(screen.getByText("All scroll levels (1–6) currently use the same effect.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add scroll" }))
    expect(container.querySelector(".order-blocked")?.textContent).toContain("Insufficient mana")
    expect(JSON.parse(window.localStorage.getItem("wl-build-draft-v2-light")!).buildOrder[1]).toMatchObject({ commandTime: 1.5 })
    fireEvent.click(screen.getByRole("button", { name: "Dark", exact: true }))
    expect(screen.queryByRole("button", { name: /^Gold Rush/ })).toBeNull()
})

test("clicking a scroll row edits its timestamp by identity, reorders and persists without adding a command", () => {
    const { container } = render(<App />)
    for (const time of ["215", "400"]) {
        fireEvent.click(screen.getByRole("button", { name: /^Gold Rush/ }))
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("checkbox"))
        fireEvent.change(screen.getByLabelText("Command time (mm:ss)"), { target: { value: time } })
        fireEvent.click(screen.getByRole("button", { name: "Add scroll" }))
    }
    const originalIds = Array.from(container.querySelectorAll(".order li")).map(row => row.getAttribute("data-rfd-draggable-id"))
    fireEvent.click(container.querySelectorAll(".order li img")[1])
    const input = screen.getByLabelText("Command time (mm:ss)") as HTMLInputElement
    expect(input.value).toBe("04:00")
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: "100.5" } })
    fireEvent.click(screen.getByRole("button", { name: "Save timestamp" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    const rows = container.querySelectorAll(".order li")
    expect(rows).toHaveLength(2)
    expect(rows[0].getAttribute("data-rfd-draggable-id")).toBe(originalIds[1])
    expect(rows[1].getAttribute("data-rfd-draggable-id")).toBe(originalIds[0])
    expect(rows[0].textContent).toContain("Insufficient mana")
    const draft = JSON.parse(window.localStorage.getItem("wl-build-draft-v2-light")!).buildOrder
    expect(draft.slice(1).map((item: { commandTime: number }) => item.commandTime)).toEqual([135, 60.5])
    expect(screen.queryByRole("button", { name: /^Reorder Gold Rush/ })).toBeNull()
})

test("timestamp editing validates input, supports keyboard access and cancellation, and removal does not open it", () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: /^Gold Rush/ }))
    fireEvent.click(screen.getByRole("button", { name: "Add scroll" }))
    const edit = screen.getByRole("button", { name: "Change Gold Rush timestamp, action 1" })
    edit.focus()
    fireEvent.click(edit)
    fireEvent.change(screen.getByLabelText("Command time (mm:ss)"), { target: { value: "60" } })
    expect((screen.getByRole("button", { name: "Save timestamp" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(document.activeElement).toBe(edit)
    fireEvent.click(edit)
    fireEvent.change(screen.getByLabelText("Command time (mm:ss)"), { target: { value: "215" } })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(container.querySelector(".order li")?.textContent).toContain("Command 1:31")
    fireEvent.click(edit)
    fireEvent.mouseDown(container.querySelector(".scroll-dialog-backdrop")!)
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Remove Gold Rush" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(container.querySelectorAll(".order li")).toHaveLength(0)
})
