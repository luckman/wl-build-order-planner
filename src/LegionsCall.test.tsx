import { fireEvent, render, screen, within } from "@testing-library/react"
import App from "./App"
import { saveActiveFaction, saveFactionDrafts } from "./game/draftStorage"
import { initialGameProfile, initialOpeningAction, economyFromProfile } from "./game/gameProfile"
import { factions, buildOrderWithDependencies } from "./game/gameData"
import { simulateBuildOrder } from "./game/buildSimulation"
import { formatDuration } from "./durationTime"

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

test("Legion's Call offers command-time production targets, saves and edits its target and level", () => {
    const profile = { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 10000, startingWood: 10000 } }
    const items = [factions.dark.items.find(item => item.id === "barracks")!]
    const plan = simulateBuildOrder(items, economyFromProfile(profile), 10, 20, 20, "Citadel").plan
    const ready = Math.ceil(plan[0].finishTime!)
    saveFactionDrafts({ light: { opening: initialOpeningAction, items: [] }, dark: { opening: initialOpeningAction, items } }, { light: profile, dark: profile })
    saveActiveFaction("dark")
    render(<App />)
    fireEvent.change(screen.getByLabelText("Legion's Call scroll level"), { target: { value: "6" } })
    fireEvent.click(screen.getByRole("button", { name: /^Legion's Call 25 mana/ }))
    const dialog = within(screen.getByRole("dialog", { name: "Use Legion's Call" }))
    expect(dialog.getByText(/recruitment time −25%.*26.5 seconds/)).toBeTruthy()
    expect((dialog.getByRole("checkbox", { name: /Use after the latest build-order action/ }) as HTMLInputElement).checked).toBe(true)
    expect((dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement).value).toBe(formatDuration(Math.ceil(plan[0].commandTime! + 1)))
    expect((dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement).disabled).toBe(true)
    expect((dialog.getByRole("button", { name: "Add scroll" }) as HTMLButtonElement).disabled).toBe(false)
    expect(dialog.getAllByRole("option").map(option => option.textContent)).toEqual(["Citadel", "Barracks"])
    fireEvent.change(dialog.getByLabelText("Target building"), { target: { value: "barracks" } })
    expect((dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement).value).toBe(formatDuration(ready))
    expect((dialog.getByLabelText("Target building") as HTMLSelectElement).value).toBe("barracks")
    fireEvent.click(dialog.getByRole("button", { name: "Add scroll" }))
    expect(screen.getByText("Target: Barracks")).toBeTruthy()
    let draft = JSON.parse(window.localStorage.getItem("wl-build-draft-v2-dark")!)
    expect(draft.buildOrder[2]).toMatchObject({ scrollId: "legions-call", commandTime: ready, targetItemId: "barracks" })
    expect(draft.gameProfile.player.darkLegionsCallLevel).toBe(6)
    fireEvent.click(screen.getByRole("button", { name: "Change Legion's Call timestamp, action 2" }))
    const editor = within(screen.getByRole("dialog", { name: "Edit Legion's Call" }))
    fireEvent.change(editor.getByLabelText("Command time (mm:ss)"), { target: { value: "00:00" } })
    expect(editor.getAllByRole("option").map(option => option.textContent)).toEqual(["Citadel", "Barracks"])
    expect((editor.getByLabelText("Target building") as HTMLSelectElement).value).toBe("barracks")
    expect((editor.getByRole("button", { name: "Save scroll" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(editor.getByLabelText("Command time (mm:ss)"), { target: { value: formatDuration(ready + 2) } })
    fireEvent.click(editor.getByRole("button", { name: "Save scroll" }))
    draft = JSON.parse(window.localStorage.getItem("wl-build-draft-v2-dark")!)
    expect(draft.buildOrder[2]).toMatchObject({ commandTime: ready + 2, targetItemId: "barracks" })
    fireEvent.click(screen.getByRole("button", { name: "Reset basic to defaults" }))
    expect((screen.getByLabelText("Legion's Call scroll level") as HTMLInputElement).value).toBe("1")
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect(screen.queryByRole("button", { name: /^Legion's Call 25 mana/ })).toBeNull()
})

test("current targets precede earlier levels and changing targets recalculates automatic time", () => {
    const profile = { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 10000, startingWood: 10000 } }
    const items = buildOrderWithDependencies(factions.dark, [], factions.dark.items.find(item => item.id === "citadel-lvl-2")!)
    const plan = simulateBuildOrder(items, economyFromProfile(profile), 10, 20, 20, "Citadel").plan
    expect(plan.every(action => !action.blocked)).toBe(true)
    saveFactionDrafts({ light: { opening: initialOpeningAction, items: [] }, dark: { opening: initialOpeningAction, items } }, { light: profile, dark: profile })
    saveActiveFaction("dark")
    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: /^Legion's Call 25 mana/ }))
    const dialog = within(screen.getByRole("dialog", { name: "Use Legion's Call" }))
    const target = dialog.getByLabelText("Target building") as HTMLSelectElement
    const time = dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement
    const checkbox = dialog.getByRole("checkbox")
    expect(target.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const options = dialog.getAllByRole("option") as HTMLOptionElement[]
    expect(options.map(option => option.textContent)).toEqual(["Barracks", "Citadel lvl 2", "---------", "Citadel"])
    expect(options[2].disabled).toBe(true)
    const latest = Math.max(...plan.map(action => action.commandTime!))
    const upgraded = plan.find(action => action.item.id === "citadel-lvl-2")!
    fireEvent.change(target, { target: { value: "citadel-lvl-2" } })
    expect(time.value).toBe(formatDuration(Math.ceil(upgraded.finishTime!)))
    fireEvent.change(target, { target: { value: "barracks" } })
    expect(time.value).toBe(formatDuration(Math.ceil(latest + 1)))
    expect(Number(time.value.replace(":", ""))).toBeLessThan(Number(formatDuration(Math.ceil(upgraded.finishTime!)).replace(":", "")))
    fireEvent.change(target, { target: { value: "citadel" } })
    expect(time.value).toBe("00:01")
    expect((dialog.getByRole("button", { name: "Add scroll" }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(checkbox)
    fireEvent.change(time, { target: { value: formatDuration(Math.ceil(upgraded.finishTime!)) } })
    expect(target.value).toBe("citadel")
    expect((dialog.getByRole("button", { name: "Add scroll" }) as HTMLButtonElement).disabled).toBe(true)
    expect(dialog.getByText("The selected building is not available at Command time.")).toBeTruthy()
})
