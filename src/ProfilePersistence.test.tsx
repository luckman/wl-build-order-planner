import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import App from "./App"
import { serializeBuildOrder } from "./game/buildOrderFile"
import { initialGameProfile, initialOpeningAction } from "./game/gameProfile"
import { draftStorageKey, saveFactionDrafts } from "./game/draftStorage"
import { loadSavedProfile, profileStorageKey, saveProfile } from "./game/profileStorage"
import { createShareableLink } from "./game/shareableLink"

const personal = { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 777 } }
const draft = { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 888 } }
const incoming = { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 999 } }
const gold = () => (screen.getByLabelText("Starting gold") as HTMLInputElement).value
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name, exact: true }))
beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState(null, "", window.location.pathname)
})
afterEach(() => {
    window.localStorage.clear()
    window.history.replaceState(null, "", window.location.pathname)
    jest.restoreAllMocks()
})

test.each([false, true].flatMap(saved => [false, true].flatMap(hasDraft =>
    ["direct", "link", "json"].map(source => ({ saved, hasDraft, source })))))(
    "$source opening with saved=$saved and draft=$hasDraft uses the correct profile", async ({ saved, hasDraft, source }) => {
        if (saved) saveProfile("light", personal)
        if (hasDraft) saveFactionDrafts({
            light: { opening: initialOpeningAction, items: [] }, dark: { opening: initialOpeningAction, items: [] },
        }, { light: draft, dark: initialGameProfile }, ["light"])
        if (source === "link") window.history.replaceState(null, "", createShareableLink(window.location.href, "light", incoming, []))
        const first = render(<App />)
        if (source === "json") {
            const text = serializeBuildOrder("light", incoming, [])
            const file = new File([text], "build.json", { type: "application/json" })
            Object.defineProperty(file, "text", { value: async () => text })
            fireEvent.change(screen.getByLabelText("Import build order JSON"), { target: { files: [file] } })
            await waitFor(() => expect(gold()).toBe("999"))
        }
        const expected = source !== "direct" ? "999" : hasDraft ? "888" : saved ? "777" : "150"
        expect(gold()).toBe(expected)
        expect(loadSavedProfile("light")).toEqual(saved ? personal : null)
        expect((screen.getByRole("button", { name: "Load saved profile" }) as HTMLButtonElement).disabled).toBe(!saved)
        if (!hasDraft && source === "direct") expect(window.localStorage.getItem(draftStorageKey("light"))).toBeNull()
        first.unmount()
        render(<App />)
        expect(gold()).toBe(expected)
    },
)

test("Save and Load are faction-specific; Load, Reset, and Clear preserve the appropriate state", () => {
    const first = render(<App />)
    const actions = first.container.querySelector(".profile-actions")!
    expect(Array.from(actions.querySelectorAll("button")).map(button => button.textContent)).toEqual([
        "Save profile", "Load saved profile", "Reset basic to defaults", "Reset all",
    ])
    expect(screen.getByRole("button", { name: "Save profile" }).title).toContain("current faction (Light)")
    expect(screen.getByRole("button", { name: "Load saved profile" }).title).toContain("current faction (Light)")
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "777" } })
    click("Advanced")
    fireEvent.change(screen.getByLabelText("Order delay (seconds)"), { target: { value: "2.5" } })
    expect(loadSavedProfile("light")).toBeNull()
    click("Save profile")
    const saved = loadSavedProfile("light")!
    expect(saved.player.startingGold).toBe(777)
    expect(saved.delays.orderDelay).toBe(2.5)
    expect(loadSavedProfile("dark")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /^Worker 150/ }))
    fireEvent.change(screen.getByLabelText("Initial gold miners"), { target: { value: "2" } })
    click("Reset all")
    expect(loadSavedProfile("light")).toEqual(saved)
    click("Load saved profile")
    expect(gold()).toBe("777")
    expect(screen.getByRole("button", { name: "Remove Worker" })).toBeTruthy()
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("2")
    click("Clear")
    expect(gold()).toBe("777")
    expect(loadSavedProfile("light")).toEqual(saved)
    expect(JSON.parse(window.localStorage.getItem(draftStorageKey("light"))!).gameProfile).toEqual(saved)
    click("Dark")
    expect(screen.getByRole("button", { name: "Save profile" }).title).toContain("current faction (Dark)")
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "888" } })
    click("Save profile")
    expect(loadSavedProfile("light")).toEqual(saved)
    first.unmount()
    render(<App />)
    expect(gold()).toBe("888")
    expect(screen.getByRole("button", { name: "Dark", exact: true }).classList.contains("selected")).toBe(true)
})

test("failed explicit save reports failure without changing the saved profile", () => {
    saveProfile("light", personal)
    render(<App />)
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage full") })
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "999" } })
    click("Save profile")
    expect(screen.getByRole("alert").textContent).toContain("Could not save")
    expect(loadSavedProfile("light")).toEqual(personal)
    expect(JSON.parse(window.localStorage.getItem(profileStorageKey("light"))!).gameProfile).toEqual(personal)
})

const resetNotice = "Your previous draft could not be restored. Starting a new build."

test.each(["", "{invalid", "[]", JSON.stringify({ version: 999 }),
    serializeBuildOrder("dark", draft, []),
])("invalid drafts reset once, preserve personal profiles and the other faction: %s", text => {
    saveProfile("light", personal)
    saveProfile("dark", incoming)
    const savedLight = window.localStorage.getItem(profileStorageKey("light"))
    const savedDark = window.localStorage.getItem(profileStorageKey("dark"))
    const darkDraft = serializeBuildOrder("dark", draft, [], false, { type: "allocate-workers", goldWorkers: 1 })
    window.localStorage.setItem(draftStorageKey("dark"), darkDraft)
    window.localStorage.setItem(draftStorageKey("light"), text)
    const first = render(<App />)
    expect(screen.getByText(resetNotice)).toBeTruthy()
    expect(gold()).toBe("777")
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("4")
    expect(screen.queryByRole("button", { name: "Remove Worker" })).toBeNull()
    expect(window.localStorage.getItem(draftStorageKey("light"))).toBeNull()
    expect(window.localStorage.getItem(draftStorageKey("dark"))).toBe(darkDraft)
    expect(window.localStorage.getItem(profileStorageKey("light"))).toBe(savedLight)
    expect(window.localStorage.getItem(profileStorageKey("dark"))).toBe(savedDark)
    first.unmount()
    render(<App />)
    expect(screen.queryByText(resetNotice)).toBeNull()
    expect(gold()).toBe("777")
    click("Dark")
    expect(gold()).toBe("888")
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("1")
})

test("missing drafts do not warn or create storage; invalid inactive drafts warn when selected", () => {
    const first = render(<App />)
    expect(screen.queryByText(resetNotice)).toBeNull()
    expect(window.localStorage.getItem(draftStorageKey("light"))).toBeNull()
    first.unmount()
    window.localStorage.setItem(draftStorageKey("dark"), "broken")
    const second = render(<App />)
    expect(screen.queryByText(resetNotice)).toBeNull()
    click("Dark")
    expect(screen.getByText(resetNotice)).toBeTruthy()
    expect(gold()).toBe("150")
    expect(window.localStorage.getItem(draftStorageKey("dark"))).toBeNull()
    second.unmount()
    render(<App />)
    expect(screen.queryByText(resetNotice)).toBeNull()
})

test("failed draft cleanup and writes leave fallback editing usable and personal profiles intact", () => {
    saveProfile("light", personal)
    window.localStorage.setItem(draftStorageKey("light"), "broken")
    jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Blocked") })
    const write = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Full") })
    const first = render(<App />)
    expect(screen.getByText(resetNotice)).toBeTruthy()
    expect(gold()).toBe("777")
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "555" } })
    fireEvent.click(screen.getByRole("button", { name: /^Worker 150/ }))
    expect(screen.getByRole("button", { name: "Remove Worker" })).toBeTruthy()
    click("Dark")
    click("Light")
    expect(gold()).toBe("555")
    expect(loadSavedProfile("light")).toEqual(personal)
    // Once writes recover, a working edit replaces the invalid draft even if removal failed.
    write.mockRestore()
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "556" } })
    first.unmount()
    render(<App />)
    expect(screen.queryByText(resetNotice)).toBeNull()
    expect(gold()).toBe("556")
    expect(loadSavedProfile("light")).toEqual(personal)
})

test("inaccessible storage does not claim a draft was invalid", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked") })
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked") })
    render(<App />)
    expect(screen.queryByText(resetNotice)).toBeNull()
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "555" } })
    click("Dark")
    click("Light")
    expect(gold()).toBe("555")
})
