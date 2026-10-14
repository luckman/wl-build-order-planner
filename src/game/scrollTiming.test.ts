import { earliestScrollTime } from "./scrollTiming"
import { economyFromProfile, initialGameProfile, scrollLevelFields } from "./gameProfile"
import { simulateBuildOrder } from "./buildSimulation"
import { createScrollAction, scrollCooldown } from "./scrolls"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"

const economy = economyFromProfile(initialGameProfile)
const scroll = (commandTime: number) => createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime }, "light")

test.each([0, 5, 100])("%s percent reduction applies to automatic timing and fixed command validation", reduction => {
    const profile = { ...initialGameProfile, player: { ...initialGameProfile.player,
        startingMana: 1000, baseManaLimit: 1000, scrollCooldownReduction: reduction } }
    const settings = economyFromProfile(profile)
    const cooldown = 10 * (1 - reduction / 100)
    expect(scrollCooldown(settings)).toBe(cooldown)
    const first = simulateBuildOrder([scroll(20)], settings, 10, 20, 20, "Castle").plan
    const next = 20 + cooldown + settings.orderDelay
    expect(earliestScrollTime(settings, first, 0)).toBe(next)
    const plan = simulateBuildOrder([scroll(20), scroll(next - 0.001), scroll(next)], settings, 10, 20, 20, "Castle").plan
    expect(plan.map(action => action.blocked)).toEqual([false, true, false])
})

test("mana readiness waits for orderDelay before command, then one second before effect", () => {
    const settings = { ...economy, startingMana: 30, manaPerMinute: 15 }
    expect(earliestScrollTime(settings, [], 0)).toBe(81)
    const { plan } = simulateBuildOrder([scroll(80), scroll(81)], settings, 10, 20, 20, "Castle")
    expect(plan[0]).toMatchObject({ commandTime: 80, blocked: true, startTime: null })
    expect(plan[0].blockedReason).toContain("order delay")
    expect(plan[1]).toMatchObject({ commandTime: 81, startTime: 82, finishTime: 112, blocked: false })
    expect(earliestScrollTime({ ...settings, orderDelay: 3 }, [], 0)).toBe(83)
})

test("cooldown readiness and mana readiness delays overlap rather than add twice", () => {
    const settings = { ...economy, startingMana: 50, manaPerMinute: 300 }
    const first = simulateBuildOrder([scroll(190)], settings, 10, 20, 20, "Castle").plan
    expect(earliestScrollTime(settings, first, 200)).toBe(201)
    expect(earliestScrollTime(settings, first, 201)).toBe(201)
    const { plan } = simulateBuildOrder([scroll(190), scroll(200), scroll(201)], settings, 10, 20, 20, "Castle")
    expect(plan[1]).toMatchObject({ commandTime: 200, blocked: true })
    expect(plan[1].blockedReason).toContain("cooldown")
    expect(plan[2]).toMatchObject({ commandTime: 201, startTime: 202, blocked: false })
})

test("mana available since the opening does not incur another delay at a later requested time", () => {
    const settings = { ...economy, startingMana: 50, orderDelay: 3 }
    expect(earliestScrollTime(settings, [], 0)).toBe(3)
    expect(earliestScrollTime(settings, [], 100)).toBe(100)
})

test("automatic timing waits for mana or reports an unreachable cost", () => {
    expect(earliestScrollTime(economy, [], 0)).toBe(91)
    expect(earliestScrollTime({ ...economy, manaPerMinute: 0 }, [], 0)).toBeNull()
    expect(earliestScrollTime({ ...economy, baseManaLimit: 40 }, [], 0)).toBeNull()
    expect(earliestScrollTime({ ...economy, startingMana: 50 }, [], 10)).toBe(10)
    const plan = simulateBuildOrder([scroll(91)], economy, 10, 20, 20, "Castle").plan
    expect(earliestScrollTime(economy, plan, 100)).toBe(392)
})

test("fractional regeneration does not postpone or block an exactly affordable command", () => {
    const settings = { ...economy, startingMana: 100, baseManaLimit: 100, orderDelay: 0 }
    const plan = simulateBuildOrder([scroll(0), scroll(10)], settings, 10, 20, 20, "Castle").plan
    expect(earliestScrollTime(settings, plan, 20)).toBe(300)
    const third = simulateBuildOrder([scroll(0), scroll(10), scroll(300)], settings, 10, 20, 20, "Castle").plan[2]
    expect(third.blocked).toBe(false)
})

test("the hidden cooldown defaults for old profiles, validates, and round-trips", () => {
    const doc = JSON.parse(serializeBuildOrder("light", initialGameProfile, []))
    delete doc.gameProfile.basic.timeBetweenScrolls
    expect(parseBuildOrder(JSON.stringify(doc)).gameProfile.basic.timeBetweenScrolls).toBe(10)
    doc.gameProfile.basic.timeBetweenScrolls = 25
    expect(parseBuildOrder(JSON.stringify(doc)).gameProfile.basic.timeBetweenScrolls).toBe(25)
    for (const value of [-1, null, "10"]) {
        doc.gameProfile.basic.timeBetweenScrolls = value
        expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow("timeBetweenScrolls")
    }
})

test.each(scrollLevelFields)("hidden %s defaults to one and validates levels one through six", field => {
    const doc = JSON.parse(serializeBuildOrder("light", initialGameProfile, []))
    delete doc.gameProfile.player[field]
    expect(parseBuildOrder(JSON.stringify(doc)).gameProfile.player[field]).toBe(1)
    doc.gameProfile.player[field] = 6
    doc.buildOrder.push({ type: "use-scroll", scrollId: "gold-rush", commandTime: 90 })
    const parsed = parseBuildOrder(JSON.stringify(doc))
    expect(parsed.gameProfile.player[field]).toBe(6)
    expect(parseBuildOrder(serializeBuildOrder("light", parsed.gameProfile, [])).gameProfile).toEqual(parsed.gameProfile)
    for (const value of [-1, 0, 7, 1.5, null, "1"]) {
        doc.gameProfile.player[field] = value
        expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow(field)
    }
})


test("fixed timestamps inside cooldown are blocked without effects, including imported commands", () => {
    const settings = { ...economy, startingMana: 1000, baseManaLimit: 1000, timeBetweenScrolls: 10, orderDelay: 0 }
    const simulate = (items: ReturnType<typeof scroll>[]) => simulateBuildOrder(items, settings, 10, 20, 20, "Castle")
    const { plan } = simulate([scroll(0), scroll(9), scroll(10)])
    expect(plan.map(action => action.blocked)).toEqual([false, true, false])
    expect(plan[1].blockedReason).toContain("cooldown")
    expect(plan[1].commandTime).toBe(9)
    expect(plan[1].startTime).toBeNull()
    const profile = { ...initialGameProfile, basic: { ...initialGameProfile.basic, timeBetweenScrolls: 25 } }
    const imported = parseBuildOrder(serializeBuildOrder("light", profile, plan))
    const updated = simulateBuildOrder(imported.buildOrder, { ...settings, timeBetweenScrolls: imported.gameProfile.basic.timeBetweenScrolls }, 10, 20, 20, "Castle")
    expect(updated.plan.map(action => action.commandTime)).toEqual([0, 9, 10])
    expect(updated.plan.map(action => action.blocked)).toEqual([false, true, true])
})
