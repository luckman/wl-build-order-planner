import { MAX_COMMAND_SECONDS } from "./game/plannerLimits"
/** Shared duration entry rules for planner events, in seconds. */
export const MAX_DURATION_SECONDS = MAX_COMMAND_SECONDS

const padSeconds = (value: string) => { const [whole, fraction] = value.split("."); return whole.padStart(2, "0") + (fraction === undefined ? "" : `.${fraction}`) }
const timeParts = (time: number) => {
    const milliseconds = Math.round(time * 1000)
    return { minutes: String(Math.floor(milliseconds / 60000)).padStart(2, "0"), seconds: padSeconds(String((milliseconds % 60000) / 1000)) }
}
export const formatDuration = (time: number) => { const { minutes, seconds } = timeParts(time); return `${minutes}:${seconds}` }
export function maskDuration(value: string) {
    const [whole, ...fractions] = value.replace(/[^\d.]/g, "").split(".")
    const digits = (whole.replace(/^0+(?=\d)/, "") || "0").padStart(4, "0")
    const seconds = Number(digits.slice(-2) + (fractions.length ? `.${fractions.join("").slice(0, 3)}` : ""))
    if (Number(digits.slice(0, -2)) * 60 + seconds > MAX_DURATION_SECONDS) return formatDuration(MAX_DURATION_SECONDS)
    return `${digits.slice(0, -2)}:${digits.slice(-2)}${fractions.length ? `.${fractions.join("").slice(0, 3)}` : ""}`
}
export function parseDuration(value: string): number | null {
    const text = value.trim()
    const match = text.includes(":") ? /^(\d+):(\d{1,2})(\.\d{1,3})?$/.exec(text) : /^(\d+)(\.\d{1,3})?$/.exec(text)
    if (!match) return null
    const digits = match[1]
    const minutes = text.includes(":") ? Number(digits) : Number(digits.slice(0, -2) || "0")
    const seconds = text.includes(":") ? Number(match[2] + (match[3] ?? "")) : Number(digits.slice(-2) + (match[2] ?? ""))
    const total = minutes * 60 + seconds
    return seconds < 60 && Number.isFinite(total) && total <= MAX_DURATION_SECONDS ? total : null
}

