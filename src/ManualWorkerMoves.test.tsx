import { fireEvent, render, screen, within } from "@testing-library/react"
import "@testing-library/jest-dom"
import App from "./App"

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

test.each(["Light", "Dark"])("%s can add, reopen and edit a manual move with its icon and feedback", faction => {
    const name = "Move gold miner to wood"
    const planner = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: faction, exact: true }))
    const picker = screen.getByRole("button", { name, exact: true })
    const icon = picker.querySelector("img")!
    expect(icon).toHaveAttribute("src", expect.stringContaining("move-gold-miner-to-wood"))
    fireEvent.click(picker)
    const add = within(screen.getByRole("dialog", { name }))
    const count = add.getByLabelText("Worker count")
    expect(count).toHaveValue(1)
    fireEvent.change(count, { target: { value: "1.5" } })
    expect(add.getByRole("button", { name: "Add event" })).toBeDisabled()
    fireEvent.change(count, { target: { value: "6" } })
    fireEvent.change(add.getByLabelText("Command time (mm:ss)"), { target: { value: "001.5" } })
    fireEvent.click(add.getByRole("button", { name: "Add event" }))

    const row = () => screen.getByRole("button", { name: `Remove ${name}` }).closest("li")!
    expect(row().querySelector("img")).toHaveAttribute("src", icon.getAttribute("src"))
    expect(within(row()).getByText("0 of 6 moved")).toBeVisible()
    expect(within(row()).getByText("Command 00:01.5")).toBeVisible()
    expect(within(row()).getByText(/Ended 00:01.5 · Only .* source workers available/)).toBeVisible()

    planner.unmount()
    render(<App />)
    fireEvent.click(within(row()).getByRole("button", { name: /Change Move gold miner to wood timestamp/ }))
    const edit = within(screen.getByRole("dialog", { name: `Edit ${name}` }))
    expect(edit.getByLabelText("Worker count")).toHaveValue(6)
    expect(edit.getByLabelText("Command time (mm:ss)")).toHaveValue("00:01.5")
    fireEvent.change(edit.getByLabelText("Worker count"), { target: { value: "1" } })
    fireEvent.click(edit.getByRole("button", { name: "Save event" }))
    expect(within(row()).getByText("1 of 1 moved")).toBeVisible()
})
