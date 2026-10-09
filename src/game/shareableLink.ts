import { deflate, Inflate } from "pako"
import { MAX_FILE_BYTES, parseBuildOrder, serializeBuildOrder, type GameProfile } from "./buildOrderFile"
import type { FactionId } from "./gameData"
import type { ScheduledAction } from "./buildSimulation"

export const MAX_SHARE_LINK_LENGTH = 16000

export function createShareableLink(baseUrl: string, faction: FactionId, profile: GameProfile, plan: ScheduledAction[]) {
    // The JSON document is shared with files; links always omit derived timings.
    const json = JSON.stringify(JSON.parse(serializeBuildOrder(faction, profile, plan)))
    const bytes = deflate(json)
    let binary = ""
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    const url = new URL(baseUrl)
    url.hash = `build=1.${encoded}`
    if (url.href.length > MAX_SHARE_LINK_LENGTH) throw new Error("This build order is too large for a shareable link. Use Export JSON instead.")
    return url.href
}

export function parseShareableLink(hash: string): ReturnType<typeof parseBuildOrder> | null {
    const encoded = new URLSearchParams(hash.replace(/^#/, "")).get("build")
    if (encoded === null) return null
    if (encoded.length > MAX_SHARE_LINK_LENGTH) throw new Error("This shareable link is too large. Use a JSON file instead.")
    if (!encoded.startsWith("1.")) throw new Error("Unsupported shareable link version.")
    const payload = encoded.slice(2)
    if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error("The shareable link is invalid or incomplete.")
    let bytes: Uint8Array
    try {
        const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
        bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    } catch { throw new Error("The shareable link is invalid or incomplete.") }
    // Bound decompression before parsing untrusted data from a URL.
    const inflater = new Inflate({ to: "string", chunkSize: 4096 })
    let json = ""
    inflater.onData = chunk => {
        if (typeof chunk !== "string") throw new Error("Invalid shareable link data.")
        if (json.length + chunk.length > MAX_FILE_BYTES) throw new Error("The shared build order is too large. Use a JSON file instead.")
        json += chunk
    }
    if (!inflater.push(bytes, true) || inflater.err) throw new Error("The shareable link is invalid or incomplete.")
    return parseBuildOrder(json)
}
