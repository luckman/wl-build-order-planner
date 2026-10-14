type AnalyticsEvent = "copy-link" | "open-build-link"
type GoatCounter = {
    count: (event: { path: string; title: string; event: boolean; no_session: boolean }) => void
}

declare global {
    interface Window {
        goatcounter?: GoatCounter
    }
}

const titles: Record<AnalyticsEvent, string> = {
    "copy-link": "Copy link",
    "open-build-link": "Open build link",
}

// The analytics script loads asynchronously. Keep early events until it is ready.
const pending: AnalyticsEvent[] = []
let waiting = false

function send(event: AnalyticsEvent) {
    try {
        window.goatcounter?.count({ path: event, title: titles[event], event: true, no_session: true })
    } catch {
        // Analytics must never interrupt copying or importing a build.
    }
}

export function trackEvent(event: AnalyticsEvent) {
    if (typeof window.goatcounter?.count === "function") {
        send(event)
        return
    }
    const script = document.querySelector<HTMLScriptElement>("script[data-goatcounter]")
    if (!script) return
    pending.push(event)
    if (waiting) return
    waiting = true
    const flush = () => {
        script.removeEventListener("load", flush)
        script.removeEventListener("error", discard)
        waiting = false
        pending.splice(0).forEach(send)
    }
    const discard = () => {
        script.removeEventListener("load", flush)
        script.removeEventListener("error", discard)
        waiting = false
        pending.length = 0
    }
    script.addEventListener("load", flush)
    script.addEventListener("error", discard)
}
