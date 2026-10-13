import { fireEvent, render, screen, within } from "@testing-library/react"
import App from "./App"
import { initialGameProfile } from "./game/gameProfile"
import { draftStorageKey, loadFactionDrafts } from "./game/draftStorage"
import { loadFactionProfiles, profileStorageKey } from "./game/profileStorage"

beforeEach(() => window.localStorage.clear())
afterEach(() => { window.localStorage.clear(); jest.restoreAllMocks() })
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

test("opening belongs to the order, persists with actions, and resource reset preserves it", () => {
    const first = render(<App />)
    const opening = screen.getByRole("region", { name: "Opening worker allocation" })
    expect(opening.closest(".order")).toBeTruthy()
    expect(first.container.querySelector(".economy")!.querySelector('input[type="range"]')).toBeNull()
    expect(within(opening).queryByRole("button")).toBeNull()
    change("Initial gold miners", "2")
    const unchangedProfile = loadFactionProfiles().light
    expect(unchangedProfile).toEqual(initialGameProfile)
    const actions = within(first.container.querySelector(".action-panel") as HTMLElement)
    fireEvent.click(actions.getByRole("button", { name: /^Worker / }))
    change("Starting gold", "777")
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }))
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("2")
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    change("Initial gold miners", "3")
    fireEvent.click(actions.getByRole("button", { name: /^Slave / }))
    first.unmount()
    render(<App />)
    expect(screen.getByRole("button", { name: "Remove Worker" })).toBeTruthy()
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("2")
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("4")
    expect(screen.queryByRole("button", { name: "Remove Worker" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("3")
    expect(screen.getByRole("button", { name: "Remove Slave" })).toBeTruthy()
    const stored = JSON.parse(window.localStorage.getItem(draftStorageKey("dark"))!)
    expect(stored).toEqual([{ type: "allocate-workers", goldWorkers: 3 }, { itemId: "slave" }])
    expect(JSON.parse(window.localStorage.getItem(profileStorageKey("dark"))!).map.goldWorkers).toBeUndefined()
})

test("starting workers are fixed at five with no profile control, including after loading old storage", () => {
    window.localStorage.setItem(profileStorageKey("light"), JSON.stringify({
        ...initialGameProfile, player: { ...initialGameProfile.player, startingWorkers: 2 },
    }))
    const first = render(<App />)
    expect(screen.queryByLabelText("Starting workers")).toBeNull()
    const slider = screen.getByLabelText("Initial gold miners") as HTMLInputElement
    expect(slider.max).toBe("4")
    expect(slider.value).toBe("4")
    expect(first.container.querySelector(".resource-legend")!.textContent).toContain("10 / 20")
    expect(loadFactionProfiles().light.player).not.toHaveProperty("startingWorkers")
    expect(JSON.parse(window.localStorage.getItem(profileStorageKey("light"))!).player).not.toHaveProperty("startingWorkers")
    change("Initial gold miners", "2")
    first.unmount()
    render(<App />)
    expect(screen.queryByLabelText("Starting workers")).toBeNull()
    expect(screen.getByText("Initial gold miners: 2 · Initial wood gatherers: 3")).toBeTruthy()
})

test("legacy resource storage moves allocation into a draft while retaining resource settings", () => {
    window.localStorage.setItem("wl-resource-profile-v1-light", JSON.stringify({
        ...initialGameProfile,
        map: { ...initialGameProfile.map, goldWorkers: 2, woodWorkers: 1 },
        player: { ...initialGameProfile.player, startingGold: 777 },
    }))
    const first = render(<App />)
    expect((screen.getByLabelText("Starting gold") as HTMLInputElement).value).toBe("777")
    expect(screen.getByText("Initial gold miners: 2 · Initial wood gatherers: 3")).toBeTruthy()
    expect(loadFactionProfiles().light.map).toEqual(initialGameProfile.map)
    first.unmount()
    render(<App />)
    expect(screen.getByText("Initial gold miners: 2 · Initial wood gatherers: 3")).toBeTruthy()
})

test("invalid stored actions fall back independently without resetting profiles", () => {
    window.localStorage.setItem(draftStorageKey("light"), JSON.stringify([{ type: "allocate-workers", goldWorkers: 7 }]))
    window.localStorage.setItem(draftStorageKey("dark"), JSON.stringify([{ type: "allocate-workers", goldWorkers: 1 }, { itemId: "slave" }]))
    const drafts = loadFactionDrafts(loadFactionProfiles())
    expect(drafts.light).toEqual({ opening: { type: "allocate-workers", goldWorkers: 4 }, items: [] })
    expect(drafts.dark.opening.goldWorkers).toBe(1)
    expect(drafts.dark.items.map(item => item.id)).toEqual(["slave"])
})
