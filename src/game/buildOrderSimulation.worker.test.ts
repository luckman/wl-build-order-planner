import { deserialize, serialize } from "v8"
import { simulateBuildOrder } from "./buildSimulation"
import type { SimulationInput, SimulationResponse } from "./buildOrderSimulation.worker"
import { factions } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { createScrollAction } from "./scrolls"

test("cloned worker requests preserve row identities and complete results across scroll appends", () => {
    const { items, startingTownHall } = factions.dark
    const slave = items.find(item => item.id === "slave")!
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000, startingMana: 500 }
    const args = [economy, (economy.goldWorkers + economy.woodWorkers) * 2, 200, 20, startingTownHall] as const
    const prefix = [
        { ...slave, orderId: "first" },
        { ...createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime: 10 }, "dark"), orderId: "whip" },
    ]
    const post = jest.spyOn(self, "postMessage").mockImplementation(() => {})
    const previousHandler = self.onmessage
    try {
        jest.isolateModules(() => require("./buildOrderSimulation.worker"))
        const send = (rows: SimulationInput[0]) => {
            const request: SimulationInput = [rows, ...args]
            const data = deserialize(serialize(request))
            self.dispatchEvent(new MessageEvent("message", { data }))
            const response = post.mock.calls[post.mock.calls.length - 1]?.[0] as SimulationResponse
            if (!response || !("result" in response)) throw new Error("Expected a successful worker response")
            expect(response.result).toEqual(simulateBuildOrder(rows, ...args))
            return response.result
        }
        const original = send(prefix)
        const extended = [...prefix, { ...slave, orderId: "second" }]
        const first = send(extended)
        const second = send([...extended, { ...slave, orderId: "third" }])
        expect(first.plan[0].item).toBe(original.plan[0].item)
        expect(first.plan[1].item).toBe(original.plan[1].item)
        expect(second.plan[2].item).toBe(first.plan[2].item)
        expect(original.plan).toHaveLength(2)
    } finally {
        self.onmessage = previousHandler
        post.mockRestore()
    }
})
