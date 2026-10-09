import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import App from "./App"
import { GAME_RULES_VERSION } from "./game/buildOrderFile"

function documentText() {
    return {
        format: "wl-build-order", version: 1, gameRulesVersion: GAME_RULES_VERSION, faction: "dark",
        gameProfile: {
            economy: {
                startingGold: 2000, startingWood: 2000, goldWorkers: 2, woodWorkers: 1,
                goldPerTrip: 40, woodPerTrip: 30, goldOutboundTravel: 4, goldReturnTravel: 4,
                goldGatherTime: 3.1, woodOutboundTravel: 4, woodReturnTravel: 4, woodGatherTime: 12.1,
                constructionStartDelay: 2,
            }, baseFoodLimit: 30, foodPerFarm: 25,
        },
        buildOrder: [
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

test("import replaces faction, profile and order, recalculates timings and preserves state after invalid imports", async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByText("Import / Export"))
    const doc = documentText()
    doc.gameRulesVersion = "older-rules"
    upload(JSON.stringify(doc))
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("different game rules"))
    expect(screen.getByRole("heading", { name: "Dark build order" })).toBeTruthy()
    expect((screen.getByLabelText("Starting gold") as HTMLInputElement).value).toBe("2000")
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("2")
    expect((screen.getByLabelText("Base food limit") as HTMLInputElement).value).toBe("30")
    expect((screen.getByLabelText("Construction start delay (seconds)") as HTMLInputElement).value).toBe("2")
    const order = within(container.querySelector(".order") as HTMLElement)
    expect(order.getAllByRole("button", { name: "Remove Goon" })).toHaveLength(2)
    expect(order.getByText("Command 0:01")).toBeTruthy()
    expect(screen.queryByText("Command 166:39")).toBeNull()
    upload("not json")
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("not valid JSON"))
    expect(screen.getByRole("heading", { name: "Dark build order" })).toBeTruthy()
    expect(order.getAllByRole("button", { name: "Remove Goon" })).toHaveLength(2)
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
        upload(JSON.stringify(documentText()))
        await waitFor(() => expect(screen.getByRole("status")).toBeTruthy())
        fireEvent.click(screen.getByRole("button", { name: "Export JSON" }))
        const readBlob = (blob: Blob) => new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsText(blob)
        })
        const plain = JSON.parse(await readBlob(blobs[0]))
        expect(plain.faction).toBe("dark")
        expect(plain.gameProfile.economy.goldPerTrip).toBe(40)
        expect(plain.buildOrder[0]).toEqual({ itemId: "barracks" })
        fireEvent.click(screen.getByLabelText("Include calculated timings"))
        fireEvent.click(screen.getByRole("button", { name: "Export JSON" }))
        const timed = JSON.parse(await readBlob(blobs[1]))
        expect(timed.buildOrder[0].timings.commandTime).toBe(1)
        expect(click).toHaveBeenCalledTimes(2)
        expect(click.mock.instances[0].download).toBe("dark-build-order.wl-build-order.json")
    } finally {
        click.mockRestore()
        URL.createObjectURL = originalCreate
        URL.revokeObjectURL = originalRevoke
    }
})
