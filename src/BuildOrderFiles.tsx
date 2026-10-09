import { useRef, useState } from "react"
import { MAX_FILE_BYTES, parseBuildOrder, serializeBuildOrder, type GameProfile } from "./game/buildOrderFile"
import { type FactionId } from "./game/gameData"
import { type ScheduledAction } from "./game/buildSimulation"

type Props = {
    faction: FactionId
    profile: GameProfile
    plan: ScheduledAction[]
    onImport: (result: ReturnType<typeof parseBuildOrder>) => void
}

export default function BuildOrderFiles({ faction, profile, plan, onImport }: Props) {
    const input = useRef<HTMLInputElement>(null)
    const [includeTimings, setIncludeTimings] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const exportFile = () => {
        try {
            const blob = new Blob([serializeBuildOrder(faction, profile, plan, includeTimings)], { type: "application/json" })
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = `${faction}-build-order.wl-build-order.json`
            document.body.appendChild(link)
            link.click()
            link.remove()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
            setError(null)
        } catch { setError("Could not export the build order. Please try again.") }
    }
    return <details className="file-menu" onKeyDown={event => {
        if (event.key === "Escape") {
            event.currentTarget.open = false
            event.currentTarget.querySelector("summary")?.focus()
        }
    }}>
        <summary>Import / Export</summary>
        <div className="build-order-files">
        <div className="file-buttons">
            <button type="button" onClick={exportFile} disabled={busy}>Export JSON</button>
            <button type="button" onClick={() => input.current?.click()} disabled={busy}>{busy ? "Importing…" : "Import JSON"}</button>
        </div>
        <label><input type="checkbox" checked={includeTimings} onChange={event => setIncludeTimings(event.target.checked)} /> Include calculated timings</label>
        <small>Import replaces the build order and game profile. Timings are always recalculated.</small>
        <input ref={input} type="file" accept=".json,application/json" aria-label="Import build order JSON" hidden
            onChange={async event => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                setBusy(true)
                setError(null)
                setMessage(null)
                try {
                    if (file.size > MAX_FILE_BYTES) throw new Error("Choose a JSON file smaller than 1 MB.")
                    const result = parseBuildOrder(await file.text())
                    onImport(result)
                    setMessage(result.warning ?? "Build order and game profile imported. Timings recalculated.")
                } catch (reason) {
                    setError(reason instanceof Error ? reason.message : "Could not read the file.")
                } finally { setBusy(false) }
            }} />
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        </div>
    </details>
}
