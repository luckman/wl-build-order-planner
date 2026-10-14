import { act, fireEvent, render, screen, within } from "@testing-library/react"
import App from "./App"
import { draftStorageKey } from "./game/draftStorage"
import { serializeBuildOrder } from "./game/buildOrderFile"
import { initialGameProfile, initialOpeningAction } from "./game/gameProfile"
import { MAX_PLAN_ACTIONS, MAX_TIMELINE_SAMPLES } from "./game/plannerLimits"

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

function fullDraft() {
    storeDraft([
        initialOpeningAction,
        ...Array.from({ length: MAX_PLAN_ACTIONS }, () => ({ type: "resources-collected", commandTime: 0, gold: 0, wood: 0 })),
    ])
}

test("action-limit notifications are red, restart their timeout, and support dismissal", () => {
    jest.useFakeTimers()
    try {
        fullDraft()
        render(<App />)
        const panel = within(screen.getByRole("region", { name: "Actions" }))
        const worker = panel.getByRole("button", { name: /^Worker 150 gold/ })
        fireEvent.click(worker)
        expect(screen.getByRole("alert").classList.contains("file-notice-error")).toBe(true)
        expect(panel.queryByRole("alert")).toBeNull()
        act(() => { jest.advanceTimersByTime(4000) })
        fireEvent.click(worker)
        act(() => { jest.advanceTimersByTime(4000) })
        expect(screen.getByRole("alert").textContent).toContain("100 actions")
        fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }))
        expect(screen.queryByRole("alert")).toBeNull()
        fireEvent.click(worker)
        act(() => { jest.advanceTimersByTime(5000) })
        expect(screen.queryByRole("alert")).toBeNull()
    } finally {
        jest.useRealTimers()
    }
})

test.each(["Resources collected", "Mana well is captured", "Mana well is lost", "Gold Rush", "Lumber Gathering"])(
    "%s keeps its dialog values and explains the action limit", name => {
        fullDraft()
        render(<App />)
        const panel = within(screen.getByRole("region", { name: "Actions" }))
        fireEvent.click(panel.getByRole("button", { name: new RegExp(`^${name}( |$)`) }))
        const element = screen.getByRole("dialog")
        const dialog = within(element)
        expect(dialog.getByRole("alert").textContent).toContain("100 actions")
        const automatic = dialog.queryByRole("checkbox")
        if (automatic) fireEvent.click(automatic)
        const time = dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement
        fireEvent.change(time, { target: { value: "00:25" } })
        if (name === "Resources collected") {
            fireEvent.change(dialog.getByLabelText("Gold"), { target: { value: "123" } })
            fireEvent.change(dialog.getByLabelText("Wood"), { target: { value: "456" } })
        }
        expect((dialog.getByRole("button", { name: name === "Resources collected" ? name : automatic ? "Add scroll" : "Add event" }) as HTMLButtonElement).disabled).toBe(true)
        fireEvent.submit(element.querySelector("form")!)
        expect(screen.getByRole("dialog")).toBe(element)
        expect(time.value).toBe("00:25")
        if (name === "Resources collected") {
            expect((dialog.getByLabelText("Gold") as HTMLInputElement).value).toBe("123")
            expect((dialog.getByLabelText("Wood") as HTMLInputElement).value).toBe("456")
        }
        expect(storedOrder()).toHaveLength(MAX_PLAN_ACTIONS + 1)
    },
)

test("panel additions repeatedly explain the limit and existing event edits remain available", () => {
    fullDraft()
    render(<App />)
    const panel = within(screen.getByRole("region", { name: "Actions" }))
    for (const name of [/^Worker 150 gold/, /^Swordsman 150 gold/, /^Castle 500 gold/]) {
        fireEvent.click(panel.getByRole("button", { name }))
        expect(screen.getByRole("alert").textContent).toContain("100 actions")
    }
    fireEvent.click(panel.getByRole("button", { name: "Castle upgrade" }))
    fireEvent.click(screen.getByRole("menuitem", { name: /^Castle lvl 2/ }))
    expect(screen.getByRole("alert").textContent).toContain("100 actions")
    fireEvent.click(screen.getByRole("button", { name: "Change Resources collected timestamp, action 1" }))
    const dialog = within(screen.getByRole("dialog"))
    expect(dialog.queryByRole("alert")).toBeNull()
    fireEvent.change(dialog.getByLabelText("Gold"), { target: { value: "123" } })
    fireEvent.click(dialog.getByRole("button", { name: "Save event" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    const saved = JSON.parse(window.localStorage.getItem(draftStorageKey("light"))!).buildOrder
    expect(saved).toHaveLength(MAX_PLAN_ACTIONS + 1)
    expect(saved[1].gold).toBe(123)
    expect(screen.queryByRole("alert")).toBeNull()
})

test("editor rejects additions with dependencies atomically at the action limit and still allows removal", () => {
    storeDraft([
        initialOpeningAction,
        ...Array.from({ length: MAX_PLAN_ACTIONS - 1 }, () => ({ type: "resources-collected", commandTime: 0, gold: 0, wood: 0 })),
    ])
    render(<App />)
    const count = () => storedOrder().length - 1
    fireEvent.click(screen.getByRole("button", { name: /^Swordsman 150 gold/ }))
    expect(count()).toBe(99)
    expect(screen.getByRole("alert").textContent).toContain("100 actions")
    fireEvent.click(screen.getByRole("button", { name: /^Worker 150 gold/ }))
    expect(count()).toBe(100)
    fireEvent.click(screen.getByRole("button", { name: /^Worker 150 gold/ }))
    expect(count()).toBe(100)
    expect(screen.getByRole("alert").textContent).toContain("100 actions")
    fireEvent.click(screen.getByRole("button", { name: "Unit is killed", exact: true }))
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toContain("100 actions")
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }))
    fireEvent.click(screen.getAllByRole("button", { name: /^Remove / })[0])
    expect(count()).toBe(99)
})

test("event time entry caps at 29:59 and its timeline samples remain bounded", () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Resources collected", exact: true }))
    const dialog = within(screen.getByRole("dialog"))
    const time = dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement
    fireEvent.change(time, { target: { value: "99:59" } })
    expect(time.value).toBe("29:59")
    fireEvent.click(dialog.getByRole("button", { name: "Resources collected" }))
    const saved = JSON.parse(window.localStorage.getItem(draftStorageKey("light"))!).buildOrder
    expect(saved[1].commandTime).toBe(1799)
    const lines = container.querySelectorAll("polyline")
    expect(lines.length).toBeGreaterThan(0)
    for (const line of Array.from(lines)) {
        expect(line.getAttribute("points")!.trim().split(/\s+/).length).toBeLessThanOrEqual(2 * (MAX_TIMELINE_SAMPLES + 2) - 1)
    }
})

function storedOrder() {
    const stored = JSON.parse(window.localStorage.getItem(draftStorageKey("light"))!)
    return stored.buildOrder
}

function storeDraft(buildOrder: unknown[]) {
    const document = JSON.parse(serializeBuildOrder("light", initialGameProfile, []))
    document.buildOrder = buildOrder
    window.localStorage.setItem(draftStorageKey("light"), JSON.stringify(document))
}
