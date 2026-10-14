import { trackEvent } from "./analytics"

afterEach(() => {
    delete window.goatcounter
    document.querySelector("script[data-goatcounter]")?.remove()
})

test("events wait for the asynchronous script and each repeated action is counted", () => {
    const script = document.createElement("script")
    script.dataset.goatcounter = "https://luckman.goatcounter.com/count"
    document.head.appendChild(script)
    trackEvent("open-build-link")
    const count = jest.fn()
    window.goatcounter = { count }
    script.dispatchEvent(new Event("load"))
    trackEvent("copy-link")
    trackEvent("copy-link")
    expect(count.mock.calls.map(([event]) => event)).toEqual([
        { path: "open-build-link", title: "Open build link", event: true, no_session: true },
        { path: "copy-link", title: "Copy link", event: true, no_session: true },
        { path: "copy-link", title: "Copy link", event: true, no_session: true },
    ])
    script.dispatchEvent(new Event("load"))
    expect(count).toHaveBeenCalledTimes(3)
})

test("a blocked script discards queued events and analytics errors do not escape", () => {
    const script = document.createElement("script")
    script.dataset.goatcounter = "https://luckman.goatcounter.com/count"
    document.head.appendChild(script)
    trackEvent("open-build-link")
    script.dispatchEvent(new Event("error"))
    const count = jest.fn(() => { throw new Error("Analytics unavailable") })
    window.goatcounter = { count }
    script.dispatchEvent(new Event("load"))
    expect(count).not.toHaveBeenCalled()
    expect(() => trackEvent("copy-link")).not.toThrow()
})
