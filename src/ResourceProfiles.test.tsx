import { fireEvent, render, screen } from "@testing-library/react"
import App from "./App"
import { initialGameProfile, scrollLevelFields } from "./game/gameProfile"
import { loadFactionProfiles, profileStorageKey, saveFactionProfiles } from "./game/profileStorage"
import { createShareableLink } from "./game/shareableLink"

beforeEach(() => window.localStorage.clear())
afterEach(() => {
    window.localStorage.clear()
    window.history.replaceState(null, "", window.location.pathname)
    jest.restoreAllMocks()
})

const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value
const change = (label: string, next: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: next } })

test("mana capacity never falls below starting mana during edits or after reload", () => {
    const first = render(<App />)
    change("Starting mana", "75")
    expect(value("Base mana capacity")).toBe("75")
    expect(screen.getByLabelText("Base mana capacity").getAttribute("min")).toBe("75")
    change("Base mana capacity", "1")
    expect(value("Base mana capacity")).toBe("75")
    expect(value("Starting mana")).toBe("75")
    change("Starting mana", "25")
    expect(value("Base mana capacity")).toBe("75")
    change("Base mana capacity", "25")
    expect(value("Base mana capacity")).toBe("25")
    first.unmount()
    render(<App />)
    expect(value("Starting mana")).toBe("25")
    expect(value("Base mana capacity")).toBe("25")
    change("Starting mana", "0")
    change("Base mana capacity", "0")
    expect(value("Base mana capacity")).toBe("0")
    change("Starting mana", "1")
    expect(value("Base mana capacity")).toBe("1")
})

test("gathering reductions use one decimal, enforce bounds, and sit in the first column with food in the second", () => {
    const { container } = render(<App />)
    const columns = container.querySelectorAll(".resource-profile-column")
    const gold = "Gold mining time reduction (seconds)"
    const wood = "Wood gathering time reduction (seconds)"
    for (const label of [gold, wood]) {
        expect(value(label)).toBe("0.0")
        expect(screen.getByLabelText(label).getAttribute("step")).toBe("0.1")
        expect(screen.getByLabelText(label).closest(".resource-profile-column")).toBe(columns[0])
    }
    for (const label of ["Base food limit", "Farm level"]) {
        expect(screen.getByLabelText(label).closest(".resource-profile-column")).toBe(columns[1])
    }
    change(gold, "1")
    change(wood, "3")
    expect(value(gold)).toBe("1.0")
    expect(value(wood)).toBe("3.0")
    change(gold, "2")
    change(wood, "6")
    expect(value(gold)).toBe("1.0")
    expect(value(wood)).toBe("5.0")
    change(gold, "-1")
    expect(value(gold)).toBe("0.0")
    change(gold, "0.5")
    expect(value(gold)).toBe("0.5")
    fireEvent.click(screen.getByRole("button", { name: "Reset basic to defaults" }))
    expect(value(gold)).toBe("0.0")
    expect(value(wood)).toBe("0.0")
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(screen.getByLabelText("Pigsty level").closest(".resource-profile-column")).toBe(columns[1])
})

test("reset basic restores main fields while preserving advanced settings, hidden settings, and the build", () => {
    const editedProfile = {
        basic: { ...initialGameProfile.basic, goldGatherTime: 5 },
        map: { goldTravelTime: 8, woodTravelTime: 9, sawmillWoodTravelTime: 2 },
        delays: { constructionStartDelay: 6, orderDelay: 3 },
        player: { ...initialGameProfile.player, startingGold: 2000, startingMana: 45, townHallLevel: 9, workerLevel: 9, lightGoldRushLevel: 2, lightLumberGatheringLevel: 3, darkWhipLevel: 5, darkLegionsCallLevel: 6, massConstructionCostReduction: 12.5 },
    }
    saveFactionProfiles({ light: editedProfile, dark: initialGameProfile })
    render(<App />)
    change("Initial gold miners", "2")
    fireEvent.click(screen.getByRole("button", { name: /^Worker / }))
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    fireEvent.click(screen.getByRole("button", { name: "Reset basic to defaults" }))

    expect(loadFactionProfiles()).toEqual({
        light: editedProfile,
        dark: initialGameProfile,
    })
    expect(value("Starting gold")).toBe("150")
    expect(value("Worker level")).toBe("1")
    expect(value("Gold travel time (seconds each way)")).toBe("8")
    expect(value("Order delay (seconds)")).toBe("3")
    expect(value("Initial gold miners")).toBe("2")
    expect(screen.getByRole("button", { name: "Remove Worker" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Hide advanced" })).toBeTruthy()
    const draftProfile = JSON.parse(window.localStorage.getItem("wl-build-draft-v2-light")!).gameProfile
    for (const field of scrollLevelFields) {
        expect(draftProfile.player[field]).toBe(editedProfile.player[field])
        expect(document.getElementById(`profile-player-${field}`)).toBeNull()
    }
    expect(draftProfile.player.massConstructionCostReduction).toBe(12.5)
    expect(document.getElementById("profile-player-massConstructionCostReduction")).toBeNull()
    expect(draftProfile.player).not.toHaveProperty("scrollLevel")
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }))
    expect(loadFactionProfiles().light.player).toEqual(draftProfile.player)
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }))
    const resetProfile = JSON.parse(window.localStorage.getItem("wl-build-draft-v2-light")!).gameProfile
    for (const field of scrollLevelFields) expect(resetProfile.player[field]).toBe(1)
    expect(resetProfile.player.massConstructionCostReduction).toBe(0)
})

test("advanced help is specific to each field, appears on hover or focus, and follows edited values", () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect(container.querySelector(".mechanics-note")).toBeNull()
    expect(screen.queryByRole("tooltip")).toBeNull()

    const sawmillHelp = screen.getByRole("button", { name: "Sawmill wood travel time (seconds) help" })
    fireEvent.mouseEnter(sawmillHelp.parentElement!)
    let tooltip = screen.getByRole("tooltip")
    expect(tooltip.textContent).toContain("resets wood travel to 0.5 seconds each way")
    expect(screen.getByLabelText("Sawmill wood travel time (seconds)").getAttribute("aria-describedby")).toBe(tooltip.id)
    change("Sawmill wood travel time (seconds)", "2")
    expect(screen.getByRole("tooltip").textContent).toContain("resets wood travel to 2 seconds each way")
    fireEvent.mouseLeave(sawmillHelp.parentElement!)
    expect(screen.queryByRole("tooltip")).toBeNull()

    const orderHelp = screen.getByRole("button", { name: "Order delay (seconds) help" })
    fireEvent.focus(orderHelp)
    tooltip = screen.getByRole("tooltip")
    expect(tooltip.textContent).toContain("Subsequent recruitment uses the normal queue")
    expect(tooltip.textContent).not.toContain("Sawmill")
    fireEvent.keyDown(orderHelp, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).toBeNull()
})

test("resource settings persist independently for each faction across remounts, including advanced settings and reset", () => {
    const first = render(<App />)
    const manaColumn = screen.getByLabelText("Starting mana").closest(".resource-profile-column")
    for (const label of ["Mana accumulation", "Mana from mana wells", "Scroll cooldown reduction (%)"]) {
        expect(screen.getByLabelText(label).closest(".resource-profile-column")).toBe(manaColumn)
    }
    change("Starting gold", "777")
    change("Starting wood", "321")
    change("Base food limit", "40")
    change("Starting mana", "42")
    change("Base mana capacity", "80")
    change("Mana accumulation", "15")
    change("Mana from mana wells", "75")
    change("Scroll cooldown reduction (%)", "5")
    change("Gold mining time reduction (seconds)", "0.5")
    change("Wood gathering time reduction (seconds)", "2.5")
    change("Tower of Mana level", "24")
    change("Initial gold miners", "2")
    change("Castle level", "15")
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    change("Gold travel time (seconds each way)", "6.5")
    change("Wood travel time (seconds each way)", "7.5")
    change("Sawmill wood travel time (seconds)", "1.5")
    change("Construction start delay (seconds)", "3.5")
    change("Order delay (seconds)", "2.5")
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(value("Starting gold")).toBe("150")
    expect(value("Citadel level")).toBe("1")
    change("Starting gold", "888")
    change("Citadel level", "9")
    change("Order delay (seconds)", "4.5")
    first.unmount()

    render(<App />)
    expect(value("Starting gold")).toBe("888")
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect(value("Starting gold")).toBe("777")
    expect(value("Starting wood")).toBe("321")
    expect(value("Base food limit")).toBe("40")
    expect(value("Starting mana")).toBe("42")
    expect(value("Base mana capacity")).toBe("80")
    expect(value("Mana accumulation")).toBe("15")
    expect(value("Mana from mana wells")).toBe("75")
    expect(value("Scroll cooldown reduction (%)")).toBe("5")
    expect(value("Gold mining time reduction (seconds)")).toBe("0.5")
    expect(value("Wood gathering time reduction (seconds)")).toBe("2.5")
    expect(value("Tower of Mana level")).toBe("24")
    expect(value("Initial gold miners")).toBe("2")
    expect(value("Castle level")).toBe("15")
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect(value("Gold travel time (seconds each way)")).toBe("6.5")
    expect(value("Wood travel time (seconds each way)")).toBe("7.5")
    expect(value("Sawmill wood travel time (seconds)")).toBe("1.5")
    expect(value("Construction start delay (seconds)")).toBe("3.5")
    expect(value("Order delay (seconds)")).toBe("2.5")
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(value("Starting gold")).toBe("888")
    expect(value("Citadel level")).toBe("9")
    expect(value("Order delay (seconds)")).toBe("4.5")
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }))
    expect(loadFactionProfiles().dark).toEqual(initialGameProfile)
    expect(loadFactionProfiles().light.player.startingGold).toBe(150)
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect(value("Starting gold")).toBe("777")
})

test("a shared import persists its draft profile without overwriting either personal profile", () => {
    saveFactionProfiles({
        light: { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 777 } },
        dark: { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 888 } },
    })
    const imported = {
        ...initialGameProfile,
        basic: { ...initialGameProfile.basic, goldGatherTime: 5, initialGoldTravelReduction: 2.5 },
        player: { ...initialGameProfile.player, startingGold: 999 },
    }
    window.history.replaceState(null, "", createShareableLink(window.location.href, "dark", imported, []))
    const first = render(<App />)
    expect(value("Starting gold")).toBe("999")
    expect(loadFactionProfiles().dark.player.startingGold).toBe(888)
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect(value("Starting gold")).toBe("777")
    first.unmount()
    window.history.replaceState(null, "", window.location.pathname)
    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(value("Starting gold")).toBe("999")
    expect(loadFactionProfiles().dark.basic).toEqual(initialGameProfile.basic)
})

test("malformed or invalid stored profiles fall back independently to defaults", () => {
    saveFactionProfiles({ light: initialGameProfile, dark: {
        ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 888 },
    } })
    for (const invalid of ["{invalid", JSON.stringify({ ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: -1 } })]) {
        window.localStorage.setItem(profileStorageKey("light"), invalid)
        const profiles = loadFactionProfiles()
        expect(profiles.light).toEqual(initialGameProfile)
        expect(profiles.dark.player.startingGold).toBe(888)
    }
})

test("storage access failures allow editing and switching profiles in memory", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage blocked") })
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage full") })
    render(<App />)
    change("Starting gold", "777")
    change("Initial gold miners", "2")
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(value("Starting gold")).toBe("150")
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect(value("Starting gold")).toBe("777")
    expect(value("Initial gold miners")).toBe("2")
})
