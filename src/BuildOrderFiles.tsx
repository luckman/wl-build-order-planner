import Notification, { type NotificationMessage } from "./Notification"
import { useCallback, useEffect, useRef, useState } from "react"
import { createShareableLink, parseShareableLink } from "./game/shareableLink"
import { saveJson } from "./saveJson"
import { MAX_FILE_BYTES, parseBuildOrder, serializeBuildOrder, type GameProfile } from "./game/buildOrderFile"
import { type FactionId } from "./game/gameData"
import { type ScheduledAction } from "./game/buildSimulation"

import type { OpeningAction } from "./game/gameProfile"
import type { BuildDraft } from "./game/draftStorage"
import { createBuildOrderFromTemplate, buildOrderTemplates } from "./game/buildOrderTemplates"

type Props = {
    opening: OpeningAction
    faction: FactionId
    profile: GameProfile
    plan: ScheduledAction[]
    onImport: (result: ReturnType<typeof parseBuildOrder>) => void
    onSelectTemplate: (draft: BuildDraft) => void
}

export default function BuildOrderFiles({ faction, profile, plan, opening, onImport, onSelectTemplate }: Props) {
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
    const [notice, setNotice] = useState<NotificationMessage | null>(null)
    const [busy, setBusy] = useState(false)
    const [manualLink, setManualLink] = useState<string | null>(null)
    const dismissNotice = useCallback(() => setNotice(null), [])
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
                // Consume this import so reloads restore the latest saved draft.
                const url = new URL(window.location.href)
                const fragment = new URLSearchParams(url.hash.slice(1))
                fragment.delete("build")
                url.hash = fragment.toString()
                window.history.replaceState(window.history.state, "", url.href)
                setNotice({ text: result.warning ?? "Shared build order and game profile loaded. Timings recalculated.", kind: result.warning ? "warning" : "success" })
                if (menu.current) menu.current.open = false
            } catch (reason) {
                setNotice({ text: reason instanceof Error ? reason.message : "Could not open the shareable link.", kind: "error" })
            }
        }
        loadLink()
        window.addEventListener("hashchange", loadLink)
        return () => window.removeEventListener("hashchange", loadLink)
    }, [onImport])
    const shareLink = async () => {
        setBusy(true)
        setError(null)
        setNotice(null)
        setManualLink(null)
        try {
            const link = createShareableLink(window.location.href, faction, profile, plan, opening)
            try {
                await navigator.clipboard.writeText(link)
                setNotice({ text: "Shareable link copied to clipboard.", kind: "success" })
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
        setManualLink(null)
        setError(null)
        setNotice(null)
        try {
            const saved = await saveJson(serializeBuildOrder(faction, profile, plan, includeTimings, opening), `${faction}-build-order.wl-build-order.json`)
            if (saved) closeMenu()
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the build order. Please try again.") }
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
        <small>Import replaces the build order and game profile. Timings are always recalculated.</small>
        <div className="file-buttons">
            <button type="button" onClick={exportFile} disabled={busy}>Export JSON</button>
            <button type="button" onClick={shareLink} disabled={busy}>Copy link</button>
            <button type="button" onClick={() => input.current?.click()} disabled={busy}>Import JSON</button>
        </div>
        <label><input type="checkbox" checked={includeTimings} onChange={event => setIncludeTimings(event.target.checked)} /> Include calculated timings</label>
        <input ref={input} type="file" accept=".json,application/json" aria-label="Import build order JSON" hidden
            onChange={async event => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                setBusy(true)
                setManualLink(null)
                setError(null)
                setNotice(null)
                try {
                    if (file.size > MAX_FILE_BYTES) throw new Error("Choose a JSON file smaller than 1 MB.")
                    const result = parseBuildOrder(await file.text())
                    onImport(result)
                    setNotice({ text: result.warning ?? "Build order and game profile imported. Timings recalculated.", kind: result.warning ? "warning" : "success" })
                    closeMenu()
                } catch (reason) {
                    setError(reason instanceof Error ? reason.message : "Could not read the file.")
                } finally { setBusy(false) }
            }} />
        {error && <p role="alert">{error}</p>}
        {manualLink && <label>Shareable link<input readOnly value={manualLink}
            ref={element => { element?.focus(); element?.select() }} onFocus={event => event.target.select()} /></label>}
        {buildOrderTemplates[faction].length > 0 && <section className="build-order-templates" aria-label="Start from template">
            <strong>Start from template</strong>
            <small>Replace the build order while keeping your Resource collection settings.</small>
            <div className="file-buttons">
                {buildOrderTemplates[faction].map(template => <button key={template.name} type="button" disabled={busy} onClick={() => {
                    if (plan.length > 0 && !window.confirm(`“${template.name}” will replace your current build order. Continue?`)) return
                    onSelectTemplate(createBuildOrderFromTemplate(faction, template))
                    setError(null)
                    setManualLink(null)
                    setNotice({ text: "Build order template loaded. Resource collection settings preserved. Timings recalculated.", kind: "success" })
                    closeMenu()
                }}>{template.name}</button>)}
            </div>
        </section>}
        </div>
    </details>
    <Notification notice={notice} onDismiss={dismissNotice} />
    </>
}
