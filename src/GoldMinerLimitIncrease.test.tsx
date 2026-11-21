import { fireEvent, render, screen, within } from "@testing-library/react"
import "@testing-library/jest-dom"
import App from "./App"

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

test("increasing the gold limit can leave existing wood gatherers in place and save that choice", () => {
    const planner = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Worker events" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Limit gold miners", exact: true }))
    const addDialog = within(screen.getByRole("dialog", { name: "Limit gold miners" }))
    fireEvent.change(addDialog.getByLabelText("Gold miner limit"), { target: { value: "5" } })
    const option = addDialog.getByRole("checkbox", { name: "Reassign existing workers" })
    expect(option).toBeChecked()
    expect(option).toBeEnabled()
    fireEvent.click(option)
    expect(option).not.toBeChecked()
    fireEvent.click(addDialog.getByRole("button", { name: "Add event" }))

    planner.unmount()
    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: /Change Limit gold miners timestamp/ }))
    const editDialog = within(screen.getByRole("dialog", { name: "Edit Limit gold miners" }))
    const savedOption = editDialog.getByRole("checkbox", { name: "Reassign existing workers" })
    expect(savedOption).toBeEnabled()
    expect(savedOption).not.toBeChecked()
})
