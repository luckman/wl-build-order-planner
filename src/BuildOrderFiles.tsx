import { useEffect, useRef, useState } from "react"
import { createShareableLink, parseShareableLink } from "./game/shareableLink"
import { saveJson } from "./saveJson"
import { MAX_FILE_BYTES, parseBuildOrder, serializeBuildOrder, type GameProfile } from "./game/buildOrderFile"
import { type FactionId } from "./game/gameData"
import { type ScheduledAction } from "./game/buildSimulation"

import type { OpeningAction } from "./game/gameProfile"

type Props = {
    opening: OpeningAction
    faction: FactionId
    profile: GameProfile
    plan: ScheduledAction[]
    onImport: (result: ReturnType<typeof parseBuildOrder>) => void
}

export default function BuildOrderFiles({ faction, profile, plan, opening, onImport }: Props) {
    const input = useRef<HTMLInputElement>(null)
    const menu = useRef<HTMLDetailsElement>(null)
    const closeMenu = () => {
        if (menu.current) {
            menu.current.open = false
            menu.current.querySelector("summary")?.focus()
        }
    }
    const [includeTimings, setIncludeTimings] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [linkError, setLinkError] = useState<string | null>(null)
    const [manualLink, setManualLink] = useState<string | null>(null)
    useEffect(() => {
        const dismissOutside = (event: MouseEvent) => {
            if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) {
                menu.current.open = false
            }
        }
        document.addEventListener("click", dismissOutside, true)
        return () => document.removeEventListener("click", dismissOutside, true)
    }, [])
    useEffect(() => {
        const loadLink = () => {
            try {
                const result = parseShareableLink(window.location.hash)
                if (!result) return
                onImport(result)
                setLinkError(null)
                setMessage(result.warning ?? "Shared build order and game profile loaded. Timings recalculated.")
                if (menu.current) menu.current.open = false
            } catch (reason) {
                setMessage(null)
                setLinkError(reason instanceof Error ? reason.message : "Could not open the shareable link.")
            }
        }
        loadLink()
        window.addEventListener("hashchange", loadLink)
        return () => window.removeEventListener("hashchange", loadLink)
    }, [onImport])
    const shareLink = async () => {
        setBusy(true)
        setLinkError(null)
        setError(null)
        setMessage(null)
        setManualLink(null)
        try {
            const link = createShareableLink(window.location.href, faction, profile, plan, opening)
            try {
                await navigator.clipboard.writeText(link)
                setMessage("Shareable link copied to clipboard.")
                closeMenu()
            } catch {
                setManualLink(link)
                setError("Could not copy automatically. Copy the link below.")
            }
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create a shareable link.") }
        finally { setBusy(false) }
    }
    const exportFile = async () => {
        setBusy(true)
        setLinkError(null)
        setManualLink(null)
        setError(null)
        setMessage(null)
        try {
            const saved = await saveJson(serializeBuildOrder(faction, profile, plan, includeTimings, opening), `${faction}-build-order.wl-build-order.json`)
            if (saved) closeMenu()
        } catch { setError("Could not save the build order. Please try again.") }
        finally { setBusy(false) }
    }
    return <><details ref={menu} className="file-menu" onKeyDown={event => {
        if (event.key === "Escape") {
            event.currentTarget.open = false
            event.currentTarget.querySelector("summary")?.focus()
        }
    }}>
        <summary>Import / Export</summary>
        <div className="build-order-files">
        <div className="file-buttons">
            <button type="button" onClick={exportFile} disabled={busy}>Export JSON</button>
            <button type="button" onClick={shareLink} disabled={busy}>Save shareable link</button>
            <button type="button" onClick={() => input.current?.click()} disabled={busy}>Import JSON</button>
        </div>
        <label><input type="checkbox" checked={includeTimings} onChange={event => setIncludeTimings(event.target.checked)} /> Include calculated timings</label>
        <small>Import replaces the build order and game profile. Timings are always recalculated.</small>
        <input ref={input} type="file" accept=".json,application/json" aria-label="Import build order JSON" hidden
            onChange={async event => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                setBusy(true)
                setLinkError(null)
                setManualLink(null)
                setError(null)
                setMessage(null)
                try {
                    if (file.size > MAX_FILE_BYTES) throw new Error("Choose a JSON file smaller than 1 MB.")
                    const result = parseBuildOrder(await file.text())
                    onImport(result)
                    setMessage(result.warning ?? "Build order and game profile imported. Timings recalculated.")
                    closeMenu()
                } catch (reason) {
                    setError(reason instanceof Error ? reason.message : "Could not read the file.")
                } finally { setBusy(false) }
            }} />
        {error && <p role="alert">{error}</p>}
        {manualLink && <label>Shareable link<input readOnly value={manualLink}
            ref={element => { element?.focus(); element?.select() }} onFocus={event => event.target.select()} /></label>}
        </div>
    </details>
    {(message || linkError) && <div className="file-notice" role={linkError ? "alert" : "status"}>
        <span>{linkError ?? message}</span>
        <button type="button" aria-label="Dismiss import message" onClick={() => { setMessage(null); setLinkError(null) }}>×</button>
    </div>}
    </>
}
