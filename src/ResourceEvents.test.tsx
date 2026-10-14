import { fireEvent, render, screen, within } from "@testing-library/react"

import App from "./App"



beforeEach(() => window.localStorage.clear())

afterEach(() => window.localStorage.clear())



test("resource dialog defaults reset, allows any valid timestamp, edits amounts and persists", () => {

    const view = render(<App />)

    const open = () => fireEvent.click(screen.getByRole("button", { name: "Add resources", exact: true }))

    open()

    let dialog = within(screen.getByRole("dialog"))

    expect((dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement).value).toBe("00:01")

    expect((dialog.getByLabelText("Gold") as HTMLInputElement).value).toBe("300")

    expect((dialog.getByLabelText("Wood") as HTMLInputElement).value).toBe("300")

    fireEvent.change(dialog.getByLabelText("Command time (mm:ss)"), { target: { value: "00:00" } })

    fireEvent.click(dialog.getByRole("button", { name: "Add resources" }))

    expect(view.container.querySelector(".resource-summary")?.textContent).toContain("Gold 450")

    expect(view.container.querySelector(".resource-summary")?.textContent).toContain("Wood 350")

    fireEvent.click(screen.getByRole("button", { name: "Change Add resources timestamp, action 1" }))

    dialog = within(screen.getByRole("dialog"))

    fireEvent.change(dialog.getByLabelText("Command time (mm:ss)"), { target: { value: "00:20.5" } })

    fireEvent.change(dialog.getByLabelText("Gold"), { target: { value: "700" } })

    fireEvent.click(dialog.getByRole("button", { name: "Save event" }))

    open()

    dialog = within(screen.getByRole("dialog"))

    expect((dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement).value).toBe("00:21")

    expect((dialog.getByLabelText("Gold") as HTMLInputElement).value).toBe("300")

    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }))

    expect(JSON.parse(window.localStorage.getItem("wl-build-draft-v2-light")!)[1]).toMatchObject({

        type: "add-resources", commandTime: 20, gold: 700, wood: 300 })

    view.unmount()

    render(<App />)

    expect(screen.getByRole("button", { name: "Remove Add resources" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Dark", exact: true }))

    expect(screen.getByRole("button", { name: "Add resources", exact: true })).toBeTruthy()

})



test("default timestamp excludes blocked scrolls and follows the latest active command", () => {

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: /^Worker / }))

    fireEvent.click(screen.getByRole("button", { name: /^Gold Rush / }))

    let dialog = within(screen.getByRole("dialog"))

    fireEvent.click(dialog.getByRole("checkbox"))

    fireEvent.change(dialog.getByLabelText("Command time (mm:ss)"), { target: { value: "00:30" } })

    fireEvent.click(dialog.getByRole("button", { name: "Add scroll" }))

    fireEvent.click(screen.getByRole("button", { name: "Add resources", exact: true }))

    dialog = within(screen.getByRole("dialog"))

    expect((dialog.getByLabelText("Command time (mm:ss)") as HTMLInputElement).value).toBe("00:02")

})

