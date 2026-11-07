import { simulateBuildOrder } from "./buildSimulation"
import type { PlannerItem } from "./gameData"

export type SimulationInput = Parameters<typeof simulateBuildOrder> extends [...infer Required, unknown?] ? Required : never
export type SimulationResult = ReturnType<typeof simulateBuildOrder>
export type SimulationResponse = { result: SimulationResult } | { error: true }

let previous: SimulationResult | undefined
let previousEconomy: SimulationInput[1] | undefined
type SimulationRow = { item: PlannerItem; key: string }
let previousRows = new Map<string, SimulationRow>()
self.onmessage = ({ data: input }: MessageEvent<SimulationInput>) => {
    const [items, economy, initialFood, foodLimit, farmFood, townHall] = input
    try {
        // Structured cloning gives unchanged rows and economy new identities.
        // Restore them for the simulator's replay and preparation caches.
        const stableEconomy = previousEconomy && JSON.stringify(previousEconomy) === JSON.stringify(economy) ? previousEconomy : economy
        const rows = new Map<string, SimulationRow>()
        const stableItems = items.map(item => {
            if (!("orderId" in item) || typeof item.orderId !== "string") return item
            const key = JSON.stringify(item)
            const prior = previousRows.get(item.orderId)
            const row = prior?.key === key ? prior : { item, key }
            rows.set(item.orderId, row)
            return row.item
        })
        const result = simulateBuildOrder(stableItems, stableEconomy, initialFood, foodLimit, farmFood, townHall, { previous })
        previous = result
        previousEconomy = stableEconomy
        previousRows = rows
        const response: SimulationResponse = { result }
        self.postMessage(response)
    } catch {
        const response: SimulationResponse = { error: true }
        self.postMessage(response)
    }
}
