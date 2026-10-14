import { useEffect } from "react"
import "./build-order-files.css"

export type NotificationMessage = { text: string; kind: "success" | "warning" | "error" }

export default function Notification({ notice, onDismiss }: {
    notice: NotificationMessage | null; onDismiss: () => void
}) {
    useEffect(() => {
        if (!notice) return
        const timeout = window.setTimeout(onDismiss, 5000)
        return () => window.clearTimeout(timeout)
    }, [notice, onDismiss])

    return notice && <div className={`file-notice file-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
        <span>{notice.text}</span>
        <button type="button" aria-label="Dismiss message" onClick={onDismiss}>×</button>
    </div>
}
