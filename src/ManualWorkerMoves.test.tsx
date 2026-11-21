import { fireEvent, render, screen, within } from "@testing-library/react"
import "@testing-library/jest-dom"
import App from "./App"

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

test.each([
    ["Light", "Move gold miner to wood", "move-gold-miner-to-wood"],
    ["Dark", "Move gold miner to wood", "move-gold-miner-to-wood"],
    ["Light", "Move wood gatherer to gold", "move-wood-gatherer-to-gold"],
    ["Dark", "Move wood gatherer to gold", "move-wood-gatherer-to-gold"],
])("%s can add, reopen and edit %s with its icon and feedback", (faction, name, iconFile) => {
    const planner = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: faction, exact: true }))
    fireEvent.change(screen.getByLabelText("Initial gold miners"), { target: { value: "2" } })
    const picker = screen.getByRole("button", { name, exact: true })
    const icon = picker.querySelector("img")!
    expect(icon).toHaveAttribute("src", expect.stringContaining(iconFile))
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
    fireEvent.click(within(row()).getByRole("button", { name: new RegExp(`Change ${name} timestamp`) }))
    const edit = within(screen.getByRole("dialog", { name: `Edit ${name}` }))
    expect(edit.getByLabelText("Worker count")).toHaveValue(6)
    expect(edit.getByLabelText("Command time (mm:ss)")).toHaveValue("00:01.5")
    fireEvent.change(edit.getByLabelText("Worker count"), { target: { value: "1" } })
    fireEvent.click(edit.getByRole("button", { name: "Save event" }))
    expect(within(row()).getByText("1 of 1 moved")).toBeVisible()
})

test("a move to gold displays the number of empty slots and how to make the move possible", () => {
    render(<App />)
    const name = "Move wood gatherer to gold"
    fireEvent.click(screen.getByRole("button", { name, exact: true }))
    const add = within(screen.getByRole("dialog", { name }))
    fireEvent.click(add.getByRole("button", { name: "Add event" }))

    const row = screen.getByRole("button", { name: `Remove ${name}` }).closest("li")!
    expect(within(row).getByText(/Only 0 gold slots available for 1 requested. Increase the gold limit or reduce the worker count./)).toBeVisible()
})
