import { useState } from "react"
import EventTimeDialog from "./EventTimeDialog"
import type { PlannerItem } from "./game/gameData"
import {
    createGoldMinerLimit, GOLD_MINER_LIMIT_NAME, goldMinerLimitTimeConflict, goldMinerLimitTimeKey, MAX_EXPLICIT_GOLD_MINERS,
    type GoldMinerLimitAction, type GoldMinerLimitCommand,
} from "./game/goldMinerLimit"

export default function GoldMinerLimitDialog({ defaultTime, action, items, profileLimit, validationError, onSave, onClose }: {
    defaultTime: number
    action?: GoldMinerLimitAction
    items: PlannerItem[]
    profileLimit: number
    validationError?: string | null
    onSave: (command: GoldMinerLimitCommand) => void
    onClose: () => void
}) {
    const [limit, setLimit] = useState<string | null>(action ? String(action.goldLimit) : null)
    const otherLimits = items.filter((item): item is GoldMinerLimitAction => item.kind === "limit-gold-miners" && item !== action)
    const limitInputAt = (time: number) => {
        const commandTime = goldMinerLimitTimeKey(time)
        let currentLimit = profileLimit
        let previousTime = -Infinity
        for (const event of otherLimits) {
            if (event.commandTime >= commandTime || event.commandTime < previousTime) continue
            currentLimit = event.goldLimit
            previousTime = event.commandTime
        }
        const suggestion = currentLimit === profileLimit ? profileLimit - 1 : profileLimit
        return limit ?? String(Math.min(MAX_EXPLICIT_GOLD_MINERS, suggestion))
    }
    const command = (time: number): GoldMinerLimitCommand => ({
        type: "limit-gold-miners", commandTime: time, limit: Number(limitInputAt(time)), reassign: action?.reassign ?? true,
    })
    return <EventTimeDialog name={GOLD_MINER_LIMIT_NAME} title={action ? `Edit ${GOLD_MINER_LIMIT_NAME}` : GOLD_MINER_LIMIT_NAME}
        commandTime={action?.commandTime ?? defaultTime} submitLabel={action ? "Save event" : "Add event"}
        onClose={onClose} onSave={time => onSave(command(time))}
        validateTime={time => {
            const commandTime = goldMinerLimitTimeKey(time)
            if (otherLimits.some(event => goldMinerLimitTimeKey(event.commandTime) === commandTime))
                return goldMinerLimitTimeConflict(time)
            if (!limitInputAt(time).trim()) return "Enter a gold miner limit."
            try { createGoldMinerLimit(command(time)); return validationError ?? null } catch (error) { return (error as Error).message }
        }}>
        {time => <label>Gold miner limit
            <input type="number" min="0" max={MAX_EXPLICIT_GOLD_MINERS} step="1"
                value={limitInputAt(time ?? defaultTime)} onChange={event => setLimit(event.target.value)} />
        </label>}
    </EventTimeDialog>
}
