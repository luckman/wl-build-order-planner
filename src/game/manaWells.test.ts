import { createManaWellAction, evaluateManaWells, manaWellCountAt, type ManaWellEventType } from "./manaWells"
import { simulateBuildOrder } from "./buildSimulation"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { manaAt } from "./resourceSimulation"
import { earliestScrollTime } from "./scrollTiming"
import { createScrollAction } from "./scrolls"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"

const event = (type: ManaWellEventType, commandTime: number) => createManaWellAction({ type, commandTime })
const capture = (time: number) => event("mana-well-is-captured", time)
const lose = (time: number) => event("mana-well-is-lost", time)
const economy = { ...economyFromProfile(initialGameProfile), startingMana: 0, baseManaLimit: 1000,
    manaPerMinute: 10, manaFromManaWells: 60, orderDelay: 10 }
const simulate = (items: Parameters<typeof simulateBuildOrder>[0], settings = economy, townHall = "Castle") =>
    simulateBuildOrder(items, settings, 10, 20, 20, townHall).plan

test("multiple wells change income immediately without granting mana, spending resources or applying delays", () => {
    const plan = simulate([capture(0), capture(30), lose(60), lose(90)])
    expect(plan.map(action => [action.commandTime, action.startTime, action.finishTime])).toEqual([
        [0, 0, 0], [30, 30, 30], [60, 60, 60], [90, 90, 90] ])
    expect(plan.every(action => !action.blocked && action.workerId === null && !action.manaCost && action.cost.gold === 0 && action.cost.wood === 0)).toBe(true)
    for (const [time, mana] of [[0, 0], [30, 35], [60, 100], [90, 135], [120, 140]])
        expect(manaAt(economy, plan, time).mana).toBeCloseTo(mana)
    expect([0, 30, 60, 90].map(time => manaWellCountAt(plan, time))).toEqual([1, 2, 1, 0])
    expect(manaAt({ ...economy, manaFromManaWells: 120 }, plan, 30).mana).toBe(65)
})

test("losses validate at their timestamp, independent of source row position, and invalid losses have no effect", () => {
    const plan = simulate([lose(30), lose(5), capture(10), lose(31)])
    expect(plan.map(action => action.blocked)).toEqual([false, true, false, true])
    expect(plan[1].blockedReason).toMatch(/at least one owned mana well/)
    expect(plan[1]).toMatchObject({ commandTime: 5, startTime: null, finishTime: null })
    expect(manaAt(economy, plan, 60).mana).toBeCloseTo(30)
    expect(manaWellCountAt(plan, 60)).toBe(0)
})

test("simultaneous wells follow source order, cannot go negative and can be lost immediately after capture", () => {
    expect(evaluateManaWells([lose(0), capture(0), lose(0), lose(0)]).map(event => event.blocked)).toEqual([true, false, false, true])
    const plan = simulate([capture(0), lose(0)])
    expect(manaAt(economy, plan, 60).mana).toBe(10)
    expect(manaWellCountAt(plan, 0)).toBe(0)
})

test("well regeneration still respects capacity and discards capped income", () => {
    const settings = { ...economy, baseManaLimit: 50, manaPerMinute: 0, orderDelay: 0 }
    const scroll = createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime: 100 }, "light")
    const plan = simulate([capture(0), scroll], settings)
    expect(plan[1].blocked).toBe(false)
    expect(manaAt(settings, plan, 100).mana).toBe(0)
    expect(manaAt(settings, plan, 110).mana).toBe(10)
})

test("automatic scroll timing accounts for a future capture and loss rather than extrapolating past them", () => {
    const settings = { ...economy, orderDelay: 1 }
    const plan = simulate([capture(30), lose(60)], settings)
    // 5 mana by capture, then 35 more by loss, then 60 seconds for the remaining 10.
    expect(earliestScrollTime(settings, plan, 0)).toBe(121)
    const command = createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime: 121 }, "light")
    expect(simulate([command, capture(30), lose(60)], settings)[0].blocked).toBe(false)
    const zeroBase = { ...settings, manaPerMinute: 0 }
    expect(earliestScrollTime(zeroBase, simulate([capture(30)], zeroBase), 0)).toBe(81)
    expect(earliestScrollTime(zeroBase, simulate([capture(30), lose(60)], zeroBase), 0)).toBeNull()
})

test("blocked losses are ignored by automatic mana suggestions and scroll validation", () => {
    const settings = { ...economy, orderDelay: 1 }
    const items = [lose(0), capture(30)]
    const plan = simulate(items, settings)
    const time = earliestScrollTime(settings, plan, 0)!
    expect(time).toBeCloseTo(69.572)
    expect(simulate([...items, createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime: time }, "light")], settings)[2].blocked).toBe(false)
})

test.each(["light", "dark"] as const)("%s well events round trip with fixed timestamps and validate again after import", faction => {
    const items = [capture(3), lose(1), lose(20)]
    const plan = simulate(items, economy, faction === "light" ? "Castle" : "Citadel")
    const json = serializeBuildOrder(faction, initialGameProfile, plan, true)
    const parsed = parseBuildOrder(json)
    expect(parsed.buildOrder).toEqual(items)
    expect(JSON.parse(json).buildOrder.slice(1).map((item: { type: string }) => item.type)).toEqual([
        "mana-well-is-captured", "mana-well-is-lost", "mana-well-is-lost" ])
    expect(simulate(parsed.buildOrder).map(action => action.blocked)).toEqual([false, true, false])
})

test.each([-1, Infinity, NaN])("well events reject invalid timestamps %s", time => {
    expect(() => capture(time)).toThrow(/commandTime/)
})
