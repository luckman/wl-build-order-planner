import { simulateBuildOrder } from "./buildSimulation"
import { factions } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { parseShareableLink } from "./shareableLink"
import { createResourcesCollectedAction } from "./resourcesCollected"
import { createScrollAction } from "./scrolls"

const link = "#build=2.eJzFVl1v2jAU_S9-jlEI0Gm8rVT9kKg6ddX6MO3BOJdg4cTo2iFFiP--ayeUJG3HJk3aQ6X43E-fe67pni0N5sKxKas0X5RKp9xgCsgitgW0yhRsmkQsEzk8lhrs9yPIkji54MMhjz8NhuS9FNLVBq2ylWN1zFc0S6WBTfdsIayS_iMzOr0RbgX4pHIyjQbDiFXGdMBh4lFVKKeEvqGIJxRb0I-Qlk0dMjtyvQRXARTfJBqtLcHxIWK52Bwr1XF10vEgmdSl2uhoQKAVVa60fu7Z4sGbgLtCIggLl_TnHUa-3Es_cEJdbLTYEZPUiHUCnSoyfxFqcRJHr5APJHdCiCC4ptNc5YoGkrSc7kUhqNFJ7eRPjZOPC3z7zI-lXc2BWgjkBHhe5gvAmljKc7KmAtfPK7XpInPIiFs7E1qfDDmV-yJlmZdaNNTHNXqNJvfNPEOg_sJ3HOYwM9SOqYrWuEKItTNK77AGZ8a6rocf2D0Nvcg8i12bn8JHNke1bjtNN_M8AUuB-em0EIhCru0JUUVaUmektku_BR2yBEpRwFu8MrgG7DL1ZKo2ZInjncC0lUzTUB-Wt4AGXuuTWlIguVivFtni6JtXwJU30fwjFnazOQ4PFBVW9iFs7PTHnrndhsRHNbSRwgGvO7Sspva5OU3Hh2jPlIP8LvWbH2D2z7AjuV3UD-DD2Kbv0gKvFcSOUgqevnmOJG-CpcmJ57Res8_DTkZLKVNL5m4hKazTwPVW84T9ScAHMOgtFNwhQOjjNCU_tQ3CRmDYkKsSm01J_PthSleRBE4oqQDBldhyHEf-8nephnpIbLoU2sKhUz9Ih5slXwXx_J8m3s7x70jMFSrSfPdiKFd9FbWwM-rQ4ZHj2fGV64skGSfdxuq3oVvO-b313PolPtsJ_S5xZfma0kBK9TzQu3S_iUl89sotnY7a5RCsKVGC5ZLuDNKFmp30o7h5PpvPKvys0Gfv5oV0pcBdO7u_MK_oCfc3kmJDmngn_0X8Oym-u1vHYu8ZVyXl5rkpyhwKd-6lWBfhf4oOlilNU--HmheOKu0T2xvuz8MvvtgX1A"
const faction = factions.light
const worker = faction.items.find(item => item.id === "worker")!
const farm = faction.items.find(item => item.id === "farm")!

function lightFixture() {
    const { buildOrder, gameProfile, opening } = parseShareableLink(link)
    const economy = economyFromProfile(gameProfile, opening)
    const args = [economy, (economy.goldWorkers + economy.woodWorkers) * 2,
        gameProfile.player.baseFoodLimit, economy.foodPerFarm, faction.startingTownHall] as const
    return { buildOrder, args }
}

test("inserting a Worker or removing Knight preserves the full Light build result", () => {
    const { buildOrder, args } = lightFixture()
    const previous = simulateBuildOrder(buildOrder, ...args)
    expect(buildOrder[34].id).toBe("knight")

    const inserted = [...buildOrder.slice(0, 34), worker, ...buildOrder.slice(34)]
    const removed = [...buildOrder.slice(0, 34), ...buildOrder.slice(35)]
    for (const order of [inserted, removed]) {
        const result = simulateBuildOrder(order, ...args, { previous })
        expect(result).toEqual(simulateBuildOrder(order, ...args))
        expect(result.plan.every(action => !action.blocked)).toBe(true)
    }
    expect(previous.plan[34].item.id).toBe("knight")
}, 60000)

test("removing a row can advance the next command before the removed command time", () => {
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000 }
    const args = [economy, 10, 100, economy.foodPerFarm, faction.startingTownHall] as const
    const prefix = Array.from({ length: 4 }, (_, i) => ({ ...worker, orderId: `worker-${i}` }))
    const delayedFarm = { ...farm, construction: { preparationDuration: 100 }, orderId: "delayed-farm" }
    const previous = simulateBuildOrder([...prefix, delayedFarm, worker], ...args)
    const changed = [...prefix, worker]
    const result = simulateBuildOrder(changed, ...args, { previous })

    expect(result.plan[4].commandTime!).toBeLessThan(previous.plan[4].commandTime!)
    expect(result).toEqual(simulateBuildOrder(changed, ...args))
})

test("swapping the Altar and Sanctuary upgrades preserves the complete Light timeline", () => {
    const { buildOrder, args } = lightFixture()
    const previous = simulateBuildOrder(buildOrder, ...args)
    const [altar, sanctuary] = buildOrder.slice(30, 32)
    expect([altar.id, sanctuary.id]).toEqual(["altar-of-heroes-lvl-2", "sanctuary-lvl-2"])
    const changed = [...buildOrder.slice(0, 30), sanctuary, altar, ...buildOrder.slice(32)]
    expect(simulateBuildOrder(changed, ...args, { previous })).toEqual(simulateBuildOrder(changed, ...args))
}, 60000)

test("moving a building across several simultaneous orders preserves source tie order", () => {
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000, orderDelay: 0 }
    const args = [economy, 10, 100, economy.foodPerFarm, faction.startingTownHall] as const
    const prefix = [worker, worker, worker, worker]
    const barracks = faction.items.find(item => item.id === "barracks")!
    const sawmill = faction.items.find(item => item.id === "sawmill")!
    const secondBarracks = { ...barracks, orderId: "second-barracks" }
    const previous = simulateBuildOrder([...prefix, barracks, sawmill, secondBarracks, farm], ...args)
    const changed = [...prefix, farm, barracks, sawmill, secondBarracks]
    const result = simulateBuildOrder(changed, ...args, { previous })

    const time = result.plan[3].commandTime
    expect(result.orderedPlan.filter(action => action.commandTime === time).map(action => action.item.id))
        .toEqual(["worker", "farm", "barracks", "sawmill", "barracks"])
    expect(result).toEqual(simulateBuildOrder(changed, ...args))
})

test("changing an earlier catalog row recalculates the blocked reason for its dependent command", () => {
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000 }
    const args = [economy, 10, 100, economy.foodPerFarm, faction.startingTownHall] as const
    const prefix = [worker, worker, worker, worker]
    const barracks = faction.items.find(item => item.id === "barracks")!
    const swordsman = faction.items.find(item => item.id === "swordsman")!
    const previous = simulateBuildOrder([...prefix, barracks, swordsman], ...args)
    const changed = [...prefix, { ...barracks, construction: { useIdleWorker: true } }, swordsman]
    const result = simulateBuildOrder(changed, ...args, { previous })

    expect(previous.plan[5].blocked).toBe(false)
    expect(result.plan[5]).toMatchObject({ blocked: true, blockedReason: expect.stringContaining("Barracks") })
    expect(result).toEqual(simulateBuildOrder(changed, ...args))
})

test("editing Elven Tree preparation preserves the Light worker schedule and deliveries", () => {
    const { buildOrder, args } = lightFixture()
    const previous = simulateBuildOrder(buildOrder, ...args)
    const tree = buildOrder[12]
    expect(tree).toMatchObject({ id: "elven-tree", construction: { preparationDuration: 2.5 } })
    const changed = [...buildOrder]
    changed[12] = { ...tree, construction: { ...tree.construction, preparationDuration: 4 } }
    const result = simulateBuildOrder(changed, ...args, { previous })

    expect(result.plan[12]).toMatchObject({ blocked: false, commandTime: 143.94, departureTime: 139.94,
        startTime: 144.94, finishTime: 194.94, workerId: 5, workerReturnTime: 198.94 })
    expect(result).toEqual(simulateBuildOrder(changed, ...args))
}, 60000)

test("editing a later preparation can invalidate an earlier construction candidate decision", () => {
    const barracks = faction.items.find(item => item.id === "barracks")!
    const sawmill = faction.items.find(item => item.id === "sawmill")!
    const prepared = { ...barracks, construction: { preparationDuration: 17 } }
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 245, startingWood: 75,
        goldWorkers: 3, woodWorkers: 2, goldPerTrip: 36, woodPerTrip: 18, goldGatherTime: 8, woodGatherTime: 2,
        constructionStartDelay: 4, orderDelay: 2 }
    const args = [economy, 10, 20, economy.foodPerFarm, faction.startingTownHall] as const
    const until = 74
    const previous = simulateBuildOrder([prepared, sawmill], ...args, until)
    const changed = [prepared, { ...sawmill, construction: { preparationDuration: 5 } }]
    const result = simulateBuildOrder(changed, ...args, { previous, until })

    expect(previous.plan[0]).toMatchObject({ departureTime: 23, commandTime: 40, blocked: false })
    expect(result.plan[0]).toMatchObject({ departureTime: 18, commandTime: 35, blocked: false })
    expect(result.plan[1].blocked).toBe(true)
    expect(result).toEqual(simulateBuildOrder(changed, ...args, until))
})

const collected = (commandTime: number, gold: number) =>
    createResourcesCollectedAction({ type: "resources-collected", commandTime, gold, wood: 0 })

test("moving Resources collected earlier preserves the complete Light timeline", () => {
    const { buildOrder, args } = lightFixture()
    const previous = simulateBuildOrder(buildOrder, ...args)
    const delivery = buildOrder[27]
    expect(delivery.kind).toBe("resources-collected")
    if (delivery.kind !== "resources-collected") throw new Error("Expected the fixture delivery")
    expect(delivery.commandTime).toBe(300)
    const changed = [...buildOrder]
    changed[27] = { ...delivery, commandTime: 290 }
    const result = simulateBuildOrder(changed, ...args, { previous })

    expect(result.plan[27].commandTime).toBe(290)
    expect(result).toEqual(simulateBuildOrder(changed, ...args))
}, 60000)

test("inserting and removing a fixed event remaps earlier events and resolves ties in row order", () => {
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000 }
    const args = [economy, 10, 100, economy.foodPerFarm, faction.startingTownHall] as const
    const early = collected(5, 50)
    const deduction = collected(90, -20000)
    const deposit = collected(90, 500)
    const order = [worker, worker, worker, worker, early, farm, deduction, worker]
    const previous = simulateBuildOrder(order, ...args)
    const inserted = [deposit, ...order]
    const result = simulateBuildOrder(inserted, ...args, { previous })

    expect(result.plan[5].item).toBe(early)
    expect(result.orderedPlan.filter(action => action.commandTime === 90).map(action => action.item))
        .toEqual([deposit, deduction])
    expect(result.deliveries.filter(delivery => delivery.time === 90 && delivery.worker === -1)[0].gold).toBe(500)
    expect(result).toEqual(simulateBuildOrder(inserted, ...args))
    expect(simulateBuildOrder(order, ...args, { previous: result })).toEqual(previous)
})

test("inserting a delivery at a catalog command time replays the purchase decision", () => {
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000 }
    const args = [economy, 10, 100, economy.foodPerFarm, faction.startingTownHall] as const
    const order = [worker, worker, worker, worker, farm]
    const until = simulateBuildOrder(order, ...args).plan[3].commandTime!
    const previous = simulateBuildOrder(order, ...args, until)
    const changed = [...order, collected(until, -20000)]
    const result = simulateBuildOrder(changed, ...args, { previous, until })

    expect(previous.plan[3].blocked).toBe(false)
    expect(result.plan[3].blocked).toBe(true)
    expect(result).toEqual(simulateBuildOrder(changed, ...args, until))
})

test("adding a future Whip cast can change travel already in progress", () => {
    const dark = factions.dark
    const slave = dark.items.find(item => item.id === "slave")!
    const pigsty = dark.items.find(item => item.id === "pigsty")!
    const barracks = dark.items.find(item => item.id === "barracks")!
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000,
        startingMana: 500, baseManaLimit: 500, constructionStartDelay: 10 }
    const args = [economy, 10, 100, economy.foodPerFarm, dark.startingTownHall] as const
    const order = [slave, slave, slave, pigsty, barracks]
    const previous = simulateBuildOrder(order, ...args)
    const cast = createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime: previous.plan[3].commandTime! + 1 }, "dark")
    const changed = [...order, cast]
    const result = simulateBuildOrder(changed, ...args, { previous })

    expect(result.plan[3].commandTime).toBe(previous.plan[3].commandTime)
    expect(result.plan[3].startTime!).toBeLessThan(previous.plan[3].startTime!)
    expect(result).toEqual(simulateBuildOrder(changed, ...args))
})

test("removing a late event can shorten an explicitly limited schedule", () => {
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000 }
    const args = [economy, 10, 100, economy.foodPerFarm, faction.startingTownHall] as const
    const order = [worker, worker, worker, worker, farm]
    const until = economy.orderDelay
    const previous = simulateBuildOrder([...order, collected(100, 50)], ...args, until)
    const result = simulateBuildOrder(order, ...args, { previous, until })

    expect(previous.plan[3].blocked).toBe(false)
    expect(result.plan[3].blocked).toBe(true)
    expect(result).toEqual(simulateBuildOrder(order, ...args, until))
})

test("mixed and repeated edits can branch from the same result without changing it", () => {
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000 }
    const args = [economy, 10, 100, economy.foodPerFarm, faction.startingTownHall] as const
    const workers = Array.from({ length: 5 }, (_, index) => ({ ...worker, orderId: "worker-" + index }))
    const barracks = faction.items.find(item => item.id === "barracks")!
    const early = collected(5, 50)
    const late = { ...collected(100, 150), orderId: "late-collection" }
    const order = [...workers.slice(0, 4), early, farm, workers[4], barracks, late]
    const previous = simulateBuildOrder(order, ...args)
    const mixed = [...workers.slice(0, 4).map(item => ({ ...item })), early, barracks, farm,
        { ...late, commandTime: 90 }, worker]
    const first = simulateBuildOrder(mixed, ...args, { previous })

    expect(first).toEqual(simulateBuildOrder(mixed, ...args))
    expect(first.plan[0].item).toBe(mixed[0])
    const next = mixed.filter(item => item !== farm)
    expect(simulateBuildOrder(next, ...args, { previous: first })).toEqual(simulateBuildOrder(next, ...args))

    first.plan[0].cost.gold = -1
    first.deliveries[0].gold = -1
    expect(simulateBuildOrder(next, ...args, { previous: first })).toEqual(simulateBuildOrder(next, ...args))
    expect(simulateBuildOrder(mixed, ...args, { previous })).toEqual(simulateBuildOrder(mixed, ...args))
    expect(previous).toEqual(simulateBuildOrder(order, ...args))
})

test("missing history and incompatible inputs produce the fresh edited result", () => {
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000 }
    const args = [economy, 10, 100, economy.foodPerFarm, faction.startingTownHall] as const
    const order = [worker, worker, worker, worker, farm, worker]
    const previous = simulateBuildOrder(order, ...args)
    const changed = [...order.slice(0, 4), collected(90, 100), worker, farm]

    expect(simulateBuildOrder(changed, ...args, { previous: { ...previous } })).toEqual(simulateBuildOrder(changed, ...args))
    const [, initialFood, baseFood, foodPerFarm, townHall] = args
    const newArgs = [{ ...economy, orderDelay: economy.orderDelay + 2 }, initialFood, baseFood, foodPerFarm, townHall] as const
    const result = simulateBuildOrder(changed, ...newArgs, { previous })
    expect(result.plan[0].commandTime).not.toBe(previous.plan[0].commandTime)
    expect(result).toEqual(simulateBuildOrder(changed, ...newArgs))
})
