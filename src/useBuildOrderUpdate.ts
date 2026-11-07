import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import createBuildOrderWorker from "./createBuildOrderWorker"
import { simulateBuildOrder } from "./game/buildSimulation"
import type { SimulationInput, SimulationResponse, SimulationResult } from "./game/buildOrderSimulation.worker"

const updateError = "Could not update the build order. Please try again."

export default function useBuildOrderUpdate() {
    const shell = useRef<HTMLDivElement>(null)
    const worker = useRef<Worker>()
    const locked = useRef(false)
    const previousFocus = useRef<HTMLElement>()
    const timer = useRef<number>()
    const [pending, setPending] = useState(false)
    const [showSpinner, setShowSpinner] = useState(false)
    const [failed, setFailed] = useState(false)
    const dismissError = useCallback(() => setFailed(false), [])

    useEffect(() => () => {
        window.clearTimeout(timer.current)
        worker.current?.terminate()
        worker.current = undefined
    }, [])

    useLayoutEffect(() => {
        if (pending || !locked.current) return
        locked.current = false
        shell.current?.removeAttribute("inert")
        if (document.activeElement === document.body && previousFocus.current?.isConnected) {
            previousFocus.current.focus({ preventScroll: true })
        }
        previousFocus.current = undefined
    }, [pending])

    const calculate = useCallback((input: SimulationInput, apply: (result: SimulationResult) => void) => {
        // A rejected request can be retried when the current update completes.
        if (locked.current) return false
        setFailed(false)
        const finish = () => {
            window.clearTimeout(timer.current)
            setShowSpinner(false)
            setPending(false)
        }
        try {
            const currentWorker = worker.current ?? (worker.current = createBuildOrderWorker())
            if (!currentWorker) {
                apply(simulateBuildOrder(...input))
                return true
            }

            const fail = (event: Event) => {
                event.preventDefault()
                currentWorker.terminate()
                worker.current = undefined
                setFailed(true)
                finish()
            }
            currentWorker.onerror = fail
            currentWorker.onmessageerror = fail
            currentWorker.onmessage = ({ data }: MessageEvent<SimulationResponse>) => {
                try {
                    if ("error" in data) setFailed(true)
                    else apply(data.result)
                } catch {
                    setFailed(true)
                } finally {
                    currentWorker.onmessage = currentWorker.onerror = currentWorker.onmessageerror = null
                    finish()
                }
            }
            currentWorker.postMessage(input)
            locked.current = true
            const active = document.activeElement
            if (active instanceof HTMLElement && shell.current?.contains(active)) previousFocus.current = active
            shell.current?.setAttribute("inert", "")
            setPending(true)
            timer.current = window.setTimeout(() => setShowSpinner(true), 100)
            return true
        } catch {
            worker.current?.terminate()
            worker.current = undefined
            setFailed(true)
            finish()
            return true
        }
    }, [])

    return { shell, pending, showSpinner, error: failed ? updateError : null, dismissError, calculate }
}
