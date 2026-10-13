import { initialPlayerLevels } from "./game/playerLevels"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import App from "./App"
import { GAME_RULES_VERSION } from "./game/buildOrderFile"
import { createShareableLink, parseShareableLink } from "./game/shareableLink"
import { initialGameProfile } from "./game/gameProfile"
import { factions } from "./game/gameData"
import { simulateBuildOrder } from "./game/buildSimulation"
import { economyFromProfile } from "./game/gameProfile"

afterEach(() => window.history.replaceState(null, "", window.location.pathname))
beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

test("opening a shared link restores the plan and recalculates it; invalid hash changes keep it intact", () => {
    const profile = { ...initialGameProfile, delays: { ...initialGameProfile.delays, orderDelay: 2.5 } }
    const slave = factions.dark.items.find(item => item.id === "slave")!
    const plan = simulateBuildOrder([slave], economyFromProfile(profile), 10, 20, 20, "Citadel").plan
    const url = createShareableLink(window.location.href, "dark", profile, plan)
    window.history.replaceState(null, "", url)
    render(<App />)
    expect(screen.getByRole("heading", { name: "Dark build order" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Remove Slave" })).toBeTruthy()
    expect(screen.getByText("Command 0:02.5")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "333" } })
    expect((screen.getByLabelText("Starting gold") as HTMLInputElement).value).toBe("333")
    window.history.replaceState(null, "", "#build=2.invalid!")
    fireEvent(window, new Event("hashchange"))
    expect(screen.getByRole("alert").textContent).toContain("invalid")
    expect(screen.getByRole("button", { name: "Remove Slave" })).toBeTruthy()
    window.history.replaceState(null, "", createShareableLink(window.location.href, "light", initialGameProfile, []))
    fireEvent(window, new Event("hashchange"))
    expect(screen.getByRole("heading", { name: "Light build order" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Remove Slave" })).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
})

test("Save shareable link copies the current profile without timings and closes the menu", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard")
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    try {
        render(<App />)
        fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "777" } })
        fireEvent.change(screen.getByRole("slider", { name: "Initial gold miners" }), { target: { value: "3" } })
        fireEvent.click(screen.getByText("Import / Export"))
        fireEvent.click(screen.getByLabelText("Include calculated timings"))
        fireEvent.click(screen.getByRole("button", { name: "Save shareable link" }))
        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("copied"))
        expect((screen.getByText("Import / Export").parentElement as HTMLDetailsElement).open).toBe(false)
        const result = parseShareableLink(new URL(writeText.mock.calls[0][0]).hash)!
        expect(result.gameProfile.player.startingGold).toBe(777)
        expect(result.opening.goldWorkers).toBe(3)
        expect(5 - result.opening.goldWorkers).toBe(2)
        writeText.mockRejectedValueOnce(new Error("Clipboard blocked"))
        fireEvent.click(screen.getByText("Import / Export"))
        fireEvent.click(screen.getByRole("button", { name: "Save shareable link" }))
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Copy the link below"))
        expect((screen.getByLabelText("Shareable link") as HTMLInputElement).value).toBe(writeText.mock.calls[1][0])
        expect((screen.getByText("Import / Export").parentElement as HTMLDetailsElement).open).toBe(true)
    } finally {
        if (original) Object.defineProperty(navigator, "clipboard", original)
        else delete (navigator as any).clipboard
    }
})

function documentText() {
    return {
        format: "wl-build-order", version: 2, gameRulesVersion: GAME_RULES_VERSION, faction: "dark",
        gameProfile: {
            basic: { goldGatherTime: 3.1, woodGatherTime: 12.1, initialGoldTravelReduction: 1 },
            map: { goldTravelTime: 4, woodTravelTime: 4, sawmillWoodTravelTime: 0.5 },
            player: { startingGold: 2000, startingWood: 2000, baseFoodLimit: 30, startingMana: 35, baseManaLimit: 50, ...initialPlayerLevels, townHallLevel: 9, farmLevel: 21 },
            delays: { constructionStartDelay: 2, orderDelay: 1 },
        },
        buildOrder: [
            { type: "allocate-workers", goldWorkers: 2 },
            { itemId: "barracks", timings: { commandTime: 9999 } },
            { itemId: "goon" }, { itemId: "goon" },
        ],
    }
}
function upload(text: string) {
    const file = new File([text], "order.json", { type: "application/json" })
    // jsdom's File does not implement text().
    Object.defineProperty(file, "text", { value: async () => text })
    fireEvent.change(screen.getByLabelText("Import build order JSON"), { target: { files: [file] } })
}

test("Reset to defaults restores every imported profile group while retaining faction, order, and advanced visibility", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard")
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    try {
        render(<App />)
        const doc = documentText()
        doc.gameProfile.basic = { goldGatherTime: 8, woodGatherTime: 15, initialGoldTravelReduction: 2 }
        doc.gameProfile.map.goldTravelTime = 6
        doc.gameProfile.map.woodTravelTime = 7
        doc.gameProfile.map.sawmillWoodTravelTime = 2
        doc.gameProfile.delays.orderDelay = 3
        fireEvent.click(screen.getByText("Import / Export"))
        upload(JSON.stringify(doc))
        await waitFor(() => expect(screen.getByRole("heading", { name: "Dark build order" })).toBeTruthy())
        fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }))
        expect(screen.queryByLabelText("Gold travel time (seconds each way)")).toBeNull()
        expect((screen.getByLabelText("Starting gold") as HTMLInputElement).value).toBe("150")
        expect((screen.getByLabelText("Starting wood") as HTMLInputElement).value).toBe("50")
        expect(screen.getByText("Initial gold miners: 2 · Initial wood gatherers: 3")).toBeTruthy()
        expect(screen.getByRole("heading", { name: "Dark build order" })).toBeTruthy()
        expect(screen.getAllByRole("button", { name: "Remove Goon" })).toHaveLength(2)
        fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
        for (const [label, value] of [
            ["Gold travel time (seconds each way)", "4"], ["Wood travel time (seconds each way)", "4"],
            ["Sawmill wood travel time (seconds)", "0.5"], ["Construction start delay (seconds)", "4"],
            ["Order delay (seconds)", "1"],
        ]) expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(value)
        fireEvent.change(screen.getByLabelText("Order delay (seconds)"), { target: { value: "9" } })
        fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }))
        expect((screen.getByLabelText("Order delay (seconds)") as HTMLInputElement).value).toBe("1")
        fireEvent.click(screen.getByText("Import / Export"))
        fireEvent.click(screen.getByRole("button", { name: "Save shareable link" }))
        await waitFor(() => expect(writeText).toHaveBeenCalled())
        const result = parseShareableLink(new URL(writeText.mock.calls[0][0]).hash)!
        expect(result.gameProfile).toEqual(initialGameProfile)
        expect(result.faction).toBe("dark")
        expect(result.buildOrder.map(item => item.id)).toEqual(["barracks", "goon", "goon"])
    } finally {
        if (original) Object.defineProperty(navigator, "clipboard", original)
        else delete (navigator as any).clipboard
    }
})

test("import replaces faction, profile and order, recalculates timings and preserves state after invalid imports", async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByText("Import / Export"))
    const doc = documentText()
    doc.gameProfile.delays.orderDelay = 2.5
    doc.gameProfile.map.sawmillWoodTravelTime = 1.25
    doc.gameProfile.basic.initialGoldTravelReduction = 2
    doc.gameRulesVersion = "older-rules"
    upload(JSON.stringify(doc))
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("different game rules"))
    expect((container.querySelector(".file-menu") as HTMLDetailsElement).open).toBe(false)
    expect(screen.getByRole("heading", { name: "Dark build order" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect((screen.getByLabelText("Starting gold") as HTMLInputElement).value).toBe("2000")
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("2")
    expect(screen.getByText("Initial gold miners: 2 · Initial wood gatherers: 3")).toBeTruthy()
    expect((screen.getByRole("slider", { name: "Initial gold miners" }) as HTMLInputElement).max).toBe("5")
    expect((screen.getByLabelText("Base food limit") as HTMLInputElement).value).toBe("30")
    expect((screen.getByLabelText("Construction start delay (seconds)") as HTMLInputElement).value).toBe("2")
    expect((screen.getByLabelText("Order delay (seconds)") as HTMLInputElement).value).toBe("2.5")
    expect((screen.getByLabelText("Sawmill wood travel time (seconds)") as HTMLInputElement).value).toBe("1.25")
    expect(screen.queryByLabelText("Initial gold travel reduction (seconds)")).toBeNull()
    const order = within(container.querySelector(".order") as HTMLElement)
    expect(order.getAllByRole("button", { name: "Remove Goon" })).toHaveLength(2)
    expect(order.getByText("Command 0:02.5")).toBeTruthy()
    expect(screen.queryByText("Command 166:39")).toBeNull()
    fireEvent.click(screen.getByText("Import / Export"))
    upload("not json")
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("not valid JSON"))
    expect((container.querySelector(".file-menu") as HTMLDetailsElement).open).toBe(true)
    expect(screen.getByRole("heading", { name: "Dark build order" })).toBeTruthy()
    expect(order.getAllByRole("button", { name: "Remove Goon" })).toHaveLength(2)
    const invalidOpening = { ...doc, buildOrder: [{ type: "allocate-workers", goldWorkers: 6 }, ...doc.buildOrder.slice(1)] }
    upload(JSON.stringify(invalidOpening))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("exceeds the starting worker count"))
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("2")
    expect(order.getAllByRole("button", { name: "Remove Goon" })).toHaveLength(2)
    fireEvent.change(screen.getByRole("slider", { name: "Initial gold miners" }), { target: { value: "3" } })
    expect(screen.getByText("Initial gold miners: 3 · Initial wood gatherers: 2")).toBeTruthy()
    expect(screen.queryByText("Moving the slider uses 5 workers.")).toBeNull()
})

test("export downloads JSON without timings by default and includes timings when checked", async () => {
    const blobs: Blob[] = []
    const create = jest.fn((blob: Blob) => { blobs.push(blob); return "blob:build-order" })
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = create
    URL.revokeObjectURL = jest.fn()
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    try {
        render(<App />)
        fireEvent.click(screen.getByText("Import / Export"))
        const doc = documentText()
        doc.gameProfile.basic.initialGoldTravelReduction = 2.5
        upload(JSON.stringify(doc))
        await waitFor(() => expect(screen.getByRole("status")).toBeTruthy())
        fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
        fireEvent.change(screen.getByLabelText("Order delay (seconds)"), { target: { value: "3.5" } })
        fireEvent.change(screen.getByLabelText("Sawmill wood travel time (seconds)"), { target: { value: "1.25" } })
        fireEvent.change(screen.getByLabelText("Gold travel time (seconds each way)"), { target: { value: "2.5" } })
        fireEvent.change(screen.getByLabelText("Wood travel time (seconds each way)"), { target: { value: "1.5" } })
        fireEvent.click(screen.getByText("Import / Export"))
        fireEvent.click(screen.getByRole("button", { name: "Export JSON" }))
        const readBlob = (blob: Blob) => new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsText(blob)
        })
        const plain = JSON.parse(await readBlob(blobs[0]))
        expect(plain.faction).toBe("dark")
        expect(plain.gameProfile.player.townHallLevel).toBe(9)
        expect(plain.gameProfile.player.goldPerTrip).toBeUndefined()
        expect(Object.keys(plain.gameProfile)).toEqual(["basic", "map", "player", "delays"])
        expect(plain.gameProfile.delays.orderDelay).toBe(3.5)
        expect(plain.gameProfile.map.sawmillWoodTravelTime).toBe(1.25)
        expect(plain.gameProfile.map.goldTravelTime).toBe(2.5)
        expect(plain.gameProfile.map.woodTravelTime).toBe(1.5)
        expect(plain.gameProfile.basic.initialGoldTravelReduction).toBe(2.5)
        expect(plain.buildOrder[0]).toEqual({ type: "allocate-workers", goldWorkers: 2 })
        expect(plain.buildOrder[1]).toEqual({ itemId: "barracks" })
        await waitFor(() => expect((screen.getByText("Import / Export").parentElement as HTMLDetailsElement).open).toBe(false))
        fireEvent.click(screen.getByText("Import / Export"))
        fireEvent.click(screen.getByLabelText("Include calculated timings"))
        fireEvent.click(screen.getByRole("button", { name: "Export JSON" }))
        await waitFor(() => expect(blobs).toHaveLength(2))
        await waitFor(() => expect((screen.getByText("Import / Export").parentElement as HTMLDetailsElement).open).toBe(false))
        const timed = JSON.parse(await readBlob(blobs[1]))
        expect(timed.buildOrder[0]).toEqual({ type: "allocate-workers", goldWorkers: 2 })
        expect(timed.buildOrder[1].timings.commandTime).toBe(3.5)
        expect(click).toHaveBeenCalledTimes(2)
        expect(click.mock.instances[0].download).toBe("dark-build-order.wl-build-order.json")
        expect(click.mock.instances[1].download).toBe("dark-build-order.wl-build-order.json")
    } finally {
        click.mockRestore()
        URL.createObjectURL = originalCreate
        URL.revokeObjectURL = originalRevoke
    }
})
