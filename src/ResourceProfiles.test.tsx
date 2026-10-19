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

test("Order delay can be cleared before entering zero and restores an unfinished empty edit on blur", () => {
    const first = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    const label = "Order delay (seconds)"
    const input = screen.getByLabelText(label)
    expect(input.getAttribute("inputmode")).toBe("decimal")
    change(label, "2.5")
    fireEvent.focus(input)
    change(label, "")
    expect(value(label)).toBe("")
    fireEvent.blur(input)
    expect(value(label)).toBe("2.5")
    fireEvent.focus(input)
    change(label, "")
    expect(value(label)).toBe("")
    change(label, "0")
    fireEvent.blur(input)
    expect(value(label)).toBe("0")
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }))
    first.unmount()
    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect(value(label)).toBe("0")
})

test.each([
    ["Starting gold", "0", "0"],
    ["Worker level", "3", "3"],
    ["Gold mining time reduction (seconds)", "0.5", "0.5"],
    ["Wood travel increase (seconds)", "0.25", "0.25"],
])("%s supports clearing and replacing its numeric value", (label, replacement, expected) => {
    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    const input = screen.getByLabelText(label)
    const previous = value(label)
    fireEvent.focus(input)
    change(label, "")
    expect(value(label)).toBe("")
    fireEvent.blur(input)
    expect(value(label)).toBe(previous)
    fireEvent.focus(input)
    change(label, "")
    change(label, replacement)
    fireEvent.blur(input)
    expect(value(label)).toBe(expected)
})

test.each(["Light", "Dark"])("%s Shipyard and Altar levels persist and reset with the profile", faction => {
    const first = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: faction }))
    change("Shipyard level", "9")
    change("Altar of Heroes level", "21")
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }))
    first.unmount()
    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: faction }))
    expect(value("Shipyard level")).toBe("9")
    expect(value("Altar of Heroes level")).toBe("21")
    fireEvent.click(screen.getByRole("button", { name: "Reset basic to defaults" }))
    expect(value("Shipyard level")).toBe("1")
    expect(value("Altar of Heroes level")).toBe("1")
    fireEvent.click(screen.getByRole("button", { name: "Load saved profile" }))
    expect(value("Shipyard level")).toBe("9")
    expect(value("Altar of Heroes level")).toBe("21")
})

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
    const firstLabels = Array.from(columns[0].querySelectorAll("label")).map(label => label.textContent)
    expect(firstLabels[firstLabels.indexOf("Sawmill level") + 1]).toBe("Worker level")
    expect(Array.from(columns[1].querySelectorAll("label")).slice(-2).map(label => label.textContent)).toEqual(["Gold Rush scroll level", "Wood Gathering scroll level"])
    change("Gold Rush scroll level", "7")
    change("Wood Gathering scroll level", "3.5")
    expect(value("Gold Rush scroll level")).toBe("6")
    expect(value("Wood Gathering scroll level")).toBe("3")
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
    const darkLabels = Array.from(columns[0].querySelectorAll("label")).map(label => label.textContent)
    expect(darkLabels[darkLabels.indexOf("Sawmill level") + 1]).toBe("Slave level")
    expect(screen.queryByLabelText("Gold Rush scroll level")).toBeNull()
    expect(screen.queryByLabelText("Wood Gathering scroll level")).toBeNull()
})

test("reset basic restores main fields while preserving advanced settings, hidden settings, and the build", () => {
    const editedProfile = {
        basic: { ...initialGameProfile.basic, goldGatherTime: 5 },
        map: { ...initialGameProfile.map, goldTravelTime: 8, woodTravelTime: 9, sawmillWoodTravelTime: 2, woodTravelTimeIncreaseBase: 0.75, maxWoodTravelTime: 8 },
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
    expect(value("Map: Wood travel time (seconds each way)")).toBe("3.5")
    expect(value("Order delay (seconds)")).toBe("3")
    expect(value("Initial gold miners")).toBe("2")
    expect(screen.getByRole("button", { name: "Remove Worker" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Hide advanced" })).toBeTruthy()
    const draftProfile = JSON.parse(window.localStorage.getItem("wl-build-draft-v2-light")!).gameProfile
    expect(draftProfile.map).toEqual({ ...editedProfile.map, woodTravelTime: initialGameProfile.map.woodTravelTime })
    expect(draftProfile.delays).toEqual(editedProfile.delays)
    for (const field of scrollLevelFields) {
        const visible = field === "lightGoldRushLevel" || field === "lightLumberGatheringLevel"
        expect(draftProfile.player[field]).toBe(visible ? 1 : editedProfile.player[field])
        expect(document.getElementById(`profile-player-${field}`) !== null).toBe(visible)
    }
    expect(draftProfile.player.massConstructionCostReduction).toBe(12.5)
    expect(document.getElementById("profile-player-massConstructionCostReduction")).toBeNull()
    expect(draftProfile.player).not.toHaveProperty("scrollLevel")
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }))
    expect(loadFactionProfiles().light.player).toEqual(draftProfile.player)
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }))
    const resetProfile = JSON.parse(window.localStorage.getItem("wl-build-draft-v2-light")!).gameProfile
    expect(resetProfile.map).toEqual(initialGameProfile.map)
    expect(resetProfile.delays).toEqual(initialGameProfile.delays)
    for (const field of scrollLevelFields) expect(resetProfile.player[field]).toBe(1)
    expect(resetProfile.player.massConstructionCostReduction).toBe(0)
})

test("advanced help is brief and specific to each field and appears on hover or focus", () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect(container.querySelector(".mechanics-note")).toBeNull()
    expect(screen.queryByRole("tooltip")).toBeNull()

    const sawmillHelp = screen.getByRole("button", { name: "Sawmill wood travel time (seconds) help" })
    fireEvent.mouseEnter(sawmillHelp.parentElement!)
    let tooltip = screen.getByRole("tooltip")
    expect(tooltip.textContent).toBe("Initial travel time each way to gather wood after each Sawmill completes.")
    expect(screen.getByLabelText("Sawmill wood travel time (seconds)").getAttribute("aria-describedby")).toBe(tooltip.id)
    change("Sawmill wood travel time (seconds)", "2")
    expect(screen.getByRole("tooltip").textContent).toBe("Initial travel time each way to gather wood after each Sawmill completes.")
    fireEvent.mouseLeave(sawmillHelp.parentElement!)
    expect(screen.queryByRole("tooltip")).toBeNull()

    for (const [label, text] of [
        ["Wood travel increase (seconds)", "Travel time each way grows by this many seconds as the forest is logged, with or without a Sawmill."],
        ["Maximum wood travel time (seconds each way)", "Maximum wood travel time each way, with or without a Sawmill."],
    ]) {
        const help = screen.getByRole("button", { name: `${label} help` })
        fireEvent.focus(help)
        expect(screen.getByRole("tooltip").textContent).toBe(text)
        fireEvent.blur(help)
    }

    const orderHelp = screen.getByRole("button", { name: "Order delay (seconds) help" })
    fireEvent.focus(orderHelp)
    tooltip = screen.getByRole("tooltip")
    expect(tooltip.textContent).toContain("Unit production has no extra spacing between commands")
    expect(tooltip.textContent).toContain("constructing or upgrading buildings")
    expect(tooltip.textContent).not.toMatch(/initial|gatherer/i)
    expect(tooltip.textContent).not.toContain("Sawmill")
    fireEvent.keyDown(orderHelp, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).toBeNull()
})

test("resource settings persist independently for each faction across remounts, including advanced settings and reset", () => {
    const first = render(<App />)
    const manaColumn = screen.getByLabelText("Starting mana").closest(".resource-profile-column")
    for (const label of ["Mana accumulation", "Mana from mana wells", "Scroll cooldown reduction (%)", "Map: Wood travel time (seconds each way)"]) {
        expect(screen.getByLabelText(label).closest(".resource-profile-column")).toBe(manaColumn)
    }
    expect(screen.getByLabelText("Map: Wood travel time (seconds each way)").closest("#advanced-profile")).toBeNull()
    expect(screen.queryByLabelText("Gold travel time (seconds each way)")).toBeNull()
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
    change("Map: Wood travel time (seconds each way)", "7.5")
    change("Sawmill wood travel time (seconds)", "1.5")
    change("Wood travel increase (seconds)", "0.75")
    change("Maximum wood travel time (seconds each way)", "8")
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
    expect(value("Map: Wood travel time (seconds each way)")).toBe("7.5")
    expect(value("Sawmill wood travel time (seconds)")).toBe("1.5")
    expect(value("Wood travel increase (seconds)")).toBe("0.75")
    expect(value("Maximum wood travel time (seconds each way)")).toBe("8")
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
