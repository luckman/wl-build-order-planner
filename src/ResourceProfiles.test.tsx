import { fireEvent, render, screen } from "@testing-library/react"
import App from "./App"
import { initialGameProfile } from "./game/gameProfile"
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

test("resource settings persist independently for each faction across remounts, including advanced settings and reset", () => {
    const first = render(<App />)
    change("Starting gold", "777")
    change("Starting wood", "321")
    change("Base food limit", "60")
    change("Starting mana", "42")
    change("Base mana capacity", "80")
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
    expect(value("Starting gold")).toBe("777")
    expect(value("Starting wood")).toBe("321")
    expect(value("Base food limit")).toBe("60")
    expect(value("Starting mana")).toBe("42")
    expect(value("Base mana capacity")).toBe("80")
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
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }))
    expect(loadFactionProfiles().dark).toEqual(initialGameProfile)
    expect(loadFactionProfiles().light.player.startingGold).toBe(777)
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect(value("Starting gold")).toBe("777")
})

test("a shared import overrides and persists only its faction's saved profile, including hidden basic settings", () => {
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
    expect(loadFactionProfiles().dark).toEqual(imported)
    fireEvent.click(screen.getByRole("button", { name: "Light" }))
    expect(value("Starting gold")).toBe("777")
    first.unmount()
    window.history.replaceState(null, "", window.location.pathname)
    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    expect(value("Starting gold")).toBe("999")
    expect(loadFactionProfiles().dark.basic).toEqual(imported.basic)
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
