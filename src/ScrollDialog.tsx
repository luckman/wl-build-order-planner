import { useEffect, useRef, useState } from "react"

import { scrollEffect, type ScrollId } from "./game/scrolls"
import type { GameProfile } from "./game/gameProfile"

import DurationInput from "./DurationInput"
import { formatDuration, parseDuration, MAX_DURATION_SECONDS } from "./durationTime"
import type { PlannerItem } from "./game/gameData"
import type { ScrollTargetOption } from "./game/recruitment"

export default function ScrollDialog({ minimumTime, automaticTime, scrollId = "gold-rush", levels = {}, onAdd, onClose, validationError,
    targetsAt, targetOptions = [], automaticTimeForTarget, initialCommandTime, initialTargetItemId }: {
    minimumTime: number; automaticTime: number | null; scrollId?: ScrollId; validationError?: string | null
    levels?: Partial<Pick<GameProfile["player"], "lightGoldRushLevel" | "lightLumberGatheringLevel" | "darkWhipLevel" | "darkLegionsCallLevel">>
    targetsAt?: (time: number) => PlannerItem[]
    targetOptions?: ScrollTargetOption[]
    automaticTimeForTarget?: (targetItemId: string) => number | null
    initialCommandTime?: number; initialTargetItemId?: string
    onAdd: (time: number, targetItemId?: string) => void; onClose: () => void
}) {
    const scroll = scrollEffect(scrollId, levels)
    const dialog = useRef<HTMLDivElement>(null)
    const editing = initialCommandTime !== undefined
    const [automatic, setAutomatic] = useState(!editing)
    const [selectedTarget, setSelectedTarget] = useState(initialTargetItemId ?? targetOptions[0]?.item.id ?? "")
    const targetItemId = selectedTarget || targetOptions[0]?.item.id
    const suggestedTime = scrollId === "legions-call" && automaticTimeForTarget
        ? targetItemId ? automaticTimeForTarget(targetItemId) : null : automaticTime
    const [manualTime, setManualTime] = useState(() => formatDuration(initialCommandTime ?? suggestedTime ?? minimumTime))
    const commandTime = automatic ? suggestedTime : parseDuration(manualTime)
    const targetValid = scrollId !== "legions-call" || (commandTime !== null && !!targetsAt?.(commandTime).some(item => item.id === targetItemId))
    const currentTargets = targetOptions.filter(option => option.current)
    const earlierTargets = targetOptions.filter(option => !option.current)
    const valid = commandTime !== null && Number.isFinite(commandTime) && commandTime >= minimumTime && commandTime <= MAX_DURATION_SECONDS && targetValid
    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null
        dialog.current?.querySelector<HTMLElement>("input, select")?.focus()
        return () => previousFocus?.focus()
    }, [])
    return <div className="scroll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
        <div ref={dialog} className="scroll-dialog panel" role="dialog" aria-modal="true" aria-labelledby="scroll-dialog-title"
            onKeyDown={event => {
                if (event.key === "Escape") { event.stopPropagation(); onClose() }
                if (event.key === "Tab") {
                    const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>("input:not(:disabled), select, button:not(:disabled)"))
                    const first = controls[0], last = controls[controls.length - 1]
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
                }
            }}>
            <h2 id="scroll-dialog-title">{editing ? "Edit" : "Use"} {scroll.name}</h2>
            <p>{scroll.description}</p>
            <form onSubmit={event => {
                event.preventDefault()
                if (valid && !validationError) {
                    if (scrollId === "legions-call") onAdd(commandTime!, targetItemId)
                    else onAdd(commandTime!)
                }
            }}>
                {scrollId === "legions-call" && <>
                    <label>Target building<select value={targetItemId ?? ""} onChange={event => setSelectedTarget(event.target.value)}>
                        {!targetOptions.length && <option value="">No production buildings or Citadel in the build order</option>}
                        {currentTargets.map(({ item }) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        {!!currentTargets.length && !!earlierTargets.length && <option disabled value="separator">---------</option>}
                        {earlierTargets.map(({ item }) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select></label>
                    {earlierTargets.some(({ item }) => item.id === targetItemId) && <p className="scroll-time-hint">This level existed earlier in the build order. Automatic timing uses a time when it was available.</p>}
                    {!targetValid && commandTime !== null && <p role="alert">The selected building is not available at Command time.</p>}
                </>}
                {!editing && <label className="scroll-automatic"><input type="checkbox" checked={automatic}
                    onChange={event => {
                        if (scrollId === "legions-call" && !event.target.checked && suggestedTime !== null) setManualTime(formatDuration(suggestedTime))
                        setAutomatic(event.target.checked)
                    }} /> {scrollId === "legions-call"
                        ? "Use after the latest build-order action, when the selected building is complete and enough mana is available"
                        : "Use after the last scroll as soon as enough mana is available"}</label>}
                <DurationInput label="Command time (mm:ss)" disabled={automatic}
                    value={automatic ? suggestedTime === null || suggestedTime > MAX_DURATION_SECONDS ? "" : formatDuration(suggestedTime) : manualTime}
                    onChange={setManualTime} />
                <p className="scroll-time-hint">The timestamp is fixed when added. Click its Build order row to change it.</p>
                {automatic && suggestedTime === null && <p role="alert">{scrollId === "legions-call"
                    ? "No automatic time is available for the selected building with enough mana. Choose another target or a manual timestamp."
                    : "Enough mana cannot be reached with the current plan. Choose a manual timestamp to add a blocked command."}</p>}
                {!automatic && (commandTime === null || commandTime < minimumTime || commandTime > MAX_DURATION_SECONDS) && <p role="alert">Enter a valid mm:ss time between {formatDuration(minimumTime)} and 29:59.</p>}
                {automatic && suggestedTime !== null && suggestedTime > MAX_DURATION_SECONDS && <p role="alert">The earliest available command exceeds the maximum time of 29:59.</p>}
                {validationError && <p role="alert">{validationError}</p>}
                <div className="scroll-dialog-buttons"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!valid || !!validationError}>{editing ? "Save scroll" : "Add scroll"}</button></div>
            </form>
        </div>
    </div>
}
