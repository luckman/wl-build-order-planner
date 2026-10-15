import type { InputHTMLAttributes } from "react"
import { formatDuration, maskDuration, parseDuration } from "./durationTime"
import "./duration-input.css"

type DurationInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "inputMode"> & {
    wholeSeconds?: boolean
    label: string
    value: string
    onChange: (value: string) => void
}

/** Default planner event duration control. Use parseDuration to obtain seconds or null for invalid input. */
export default function DurationInput({ label, value, onChange, onFocus, onBlur, className, wholeSeconds = false, ...inputProps }: DurationInputProps) {
    return <label className="duration-control">{label}
        <input {...inputProps} className={["duration-input", className].filter(Boolean).join(" ")} type="text" inputMode={wholeSeconds ? "numeric" : "decimal"}
            placeholder={inputProps.placeholder ?? "02:15"} value={value}
            onChange={event => {
                const input = event.target
                const rightCharacters = input.value.slice(input.selectionStart ?? input.value.length).replace(/:/g, "").length
                const masked = maskDuration(wholeSeconds ? input.value.split(".")[0] : input.value)
                onChange(masked)
                // Apply the mask and caret together before another input event.
                // A deferred caret update can race with rapid typing or selection.
                input.value = masked
                if (document.activeElement === input) {
                    let position = masked.length, remaining = rightCharacters
                    while (position > 0 && remaining > 0) { position--; if (masked[position] !== ":") remaining-- }
                    input.setSelectionRange(position, position)
                }
            }}
            onFocus={event => { event.target.select(); onFocus?.(event) }}
            onBlur={event => {
                const time = parseDuration(value)
                if (time !== null) onChange(formatDuration(wholeSeconds ? Math.floor(time) : time))
                onBlur?.(event)
            }} />
    </label>
}
