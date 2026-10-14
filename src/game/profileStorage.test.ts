import { FILE_VERSION } from "./buildOrderFile"
import { initialGameProfile } from "./gameProfile"
import { loadSavedProfile, profileStorageKey, saveProfile } from "./profileStorage"

// Fixed storage fixtures; do not generate their versions with today's serializer.
const legacy = { player: { startingGold: 777 }, delays: { orderDelay: 2.5 } }
const envelope = { format: "wl-personal-profile", version: 2, faction: "light", gameProfile: legacy }
const expected = { ...initialGameProfile,
    player: { ...initialGameProfile.player, startingGold: 777 },
    delays: { ...initialGameProfile.delays, orderDelay: 2.5 } }

beforeEach(() => window.localStorage.clear())
afterEach(() => { jest.restoreAllMocks(); window.localStorage.clear() })

test("current envelopes validate without rewriting; explicit saves record the shared schema version", () => {
    const text = JSON.stringify(envelope)
    window.localStorage.setItem(profileStorageKey("light"), text)
    expect(loadSavedProfile("light")).toEqual(expected)
    expect(window.localStorage.getItem(profileStorageKey("light"))).toBe(text)
    saveProfile("dark", expected)
    expect(JSON.parse(window.localStorage.getItem(profileStorageKey("dark"))!)).toEqual({
        format: "wl-personal-profile", version: FILE_VERSION, faction: "dark", gameProfile: expected,
    })
    expect(loadSavedProfile("dark")).toEqual(expected)
})

test("valid legacy raw profiles migrate only their own faction and remain readable on reload", () => {
    window.localStorage.setItem(profileStorageKey("light"), JSON.stringify(legacy))
    saveProfile("dark", initialGameProfile)
    const dark = window.localStorage.getItem(profileStorageKey("dark"))
    expect(loadSavedProfile("light")).toEqual(expected)
    expect(JSON.parse(window.localStorage.getItem(profileStorageKey("light"))!)).toEqual({ ...envelope, gameProfile: expected })
    expect(loadSavedProfile("light")).toEqual(expected)
    expect(window.localStorage.getItem(profileStorageKey("dark"))).toBe(dark)
})

test.each([
    "", "{invalid", "null", "[]", "{}", JSON.stringify({ player: {} }),
    JSON.stringify({ unknown: 42 }),
    JSON.stringify({ ...envelope, format: "other", ...legacy }),
    JSON.stringify({ ...envelope, version: 999, ...legacy }),
    JSON.stringify({ ...envelope, version: "2" }),
    JSON.stringify({ ...envelope, faction: "dark" }),
    JSON.stringify({ ...envelope, faction: undefined }),
    JSON.stringify({ ...envelope, version: undefined }),
    JSON.stringify({ ...envelope, gameProfile: undefined }),
    JSON.stringify({ ...envelope, gameProfile: null }),
    JSON.stringify({ ...envelope, gameProfile: {} }),
    JSON.stringify({ ...envelope, gameProfile: { player: { startingGold: -1 } } }),
    JSON.stringify({ ...envelope, gameProfile: { player: { startingGold: 777 }, basic: null } }),
    JSON.stringify({ player: { startingGold: -1 } }),
])("invalid saved data fails safely without migration: %s", text => {
    window.localStorage.setItem(profileStorageKey("light"), text)
    saveProfile("dark", expected)
    expect(loadSavedProfile("light")).toBeNull()
    expect(loadSavedProfile("dark")).toEqual(expected)
    expect(window.localStorage.getItem(profileStorageKey("light"))).toBe(text)
})

test("legacy migration write failures preserve the usable profile and original storage", () => {
    const text = JSON.stringify(legacy)
    window.localStorage.setItem(profileStorageKey("light"), text)
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Full") })
    expect(loadSavedProfile("light")).toEqual(expected)
    expect(window.localStorage.getItem(profileStorageKey("light"))).toBe(text)
    expect(() => saveProfile("light", initialGameProfile)).toThrow("Full")
})

test("missing entries and inaccessible storage return no saved profile", () => {
    expect(loadSavedProfile("light")).toBeNull()
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked") })
    expect(loadSavedProfile("light")).toBeNull()
})
