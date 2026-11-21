import { useState } from "react"
import EventTimeDialog from "./EventTimeDialog"
import type { PlannerItem } from "./game/gameData"
import {
    createGoldMinerLimit, GOLD_MINER_LIMIT_NAME, goldMinerLimitBefore, goldMinerLimitTimeConflict, goldMinerLimitTimeKey,
    MAX_EXPLICIT_GOLD_MINERS, OPENING_GOLD_LIMIT_WARNING,
    type GoldMinerLimitAction, type GoldMinerLimitCommand,
} from "./game/goldMinerLimit"

export default function GoldMinerLimitDialog({ defaultTime, action, items, profileLimit, goldAssignmentsBefore,
    openingGoldWorkers, canBeFirstAtOpening, validationError, onSave, onClose }: {
    defaultTime: number
    action?: GoldMinerLimitAction
    items: PlannerItem[]
    profileLimit: number
    goldAssignmentsBefore: (time: number) => number
    openingGoldWorkers: number
    canBeFirstAtOpening: boolean
    validationError?: string | null
    onSave: (command: GoldMinerLimitCommand) => void
    onClose: () => void
}) {
    const [limit, setLimit] = useState<string | null>(action ? String(action.goldLimit) : null)
    const otherLimits = items.filter((item): item is GoldMinerLimitAction => item.kind === "limit-gold-miners" && item !== action)
    const previousLimit = (time: number) => goldMinerLimitBefore(otherLimits, profileLimit, time)
    const limitInputAt = (time: number) => {
        const suggestion = previousLimit(time) === profileLimit ? profileLimit - 1 : profileLimit
        return limit ?? String(Math.min(MAX_EXPLICIT_GOLD_MINERS, suggestion))
    }
    const requiresReassignment = (time: number, goldLimit: number) => {
        const previous = previousLimit(time)
        return goldLimit < previous || goldAssignmentsBefore(time) > goldLimit
    }
    const command = (time: number): GoldMinerLimitCommand => ({
        type: "limit-gold-miners", commandTime: time, limit: Number(limitInputAt(time)), reassign: action?.reassign ?? true,
    })
    return <EventTimeDialog name={GOLD_MINER_LIMIT_NAME} title={action ? `Edit ${GOLD_MINER_LIMIT_NAME}` : GOLD_MINER_LIMIT_NAME}
        commandTime={action?.commandTime ?? defaultTime} submitLabel={action ? "Save event" : "Add event"}
        onClose={onClose} onSave={time => {
            const next = command(time)
            onSave({ ...next, reassign: requiresReassignment(time, next.limit) ? true : next.reassign })
        }}
        validateTime={time => {
            const commandTime = goldMinerLimitTimeKey(time)
            if (otherLimits.some(event => goldMinerLimitTimeKey(event.commandTime) === commandTime))
                return goldMinerLimitTimeConflict(time)
            if (!limitInputAt(time).trim()) return "Enter a gold miner limit."
            try { createGoldMinerLimit(command(time)); return validationError ?? null } catch (error) { return (error as Error).message }
        }}>
        {time => {
            const value = limitInputAt(time ?? defaultTime)
            const goldLimit = Number(value)
            const validLimit = value.trim().length > 0 && Number.isInteger(goldLimit) && goldLimit >= 0 && goldLimit <= MAX_EXPLICIT_GOLD_MINERS
            return <>
                <label>Gold miner limit
                    <input type="number" min="0" max={MAX_EXPLICIT_GOLD_MINERS} step="1"
                        value={value} onChange={event => setLimit(event.target.value)} />
                </label>
                {validLimit && time !== null && requiresReassignment(time, goldLimit) && <label className="scroll-automatic">
                    <input type="checkbox" checked disabled /> Reassign existing workers
                </label>}
                {validLimit && canBeFirstAtOpening && time === 0 && goldLimit < openingGoldWorkers &&
                    <p className="opening-gold-limit-warning" role="status">{OPENING_GOLD_LIMIT_WARNING}</p>}
            </>
        }}
    </EventTimeDialog>
}
