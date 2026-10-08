import { fireEvent, render, screen, within } from "@testing-library/react"
import App from "./App"

test.each([
    ["Light", "Worker"],
    ["Dark", "Slave"],
])("%s town hall serializes worker training", (faction, worker) => {
    const { container } = render(<App />)
    if (faction === "Dark") {
        fireEvent.click(screen.getByRole("button", { name: "Dark" }))
    }
    const action = container.querySelector(".action-panel") as HTMLElement
    const addWorker = within(action).getByRole("button", { name: new RegExp(worker) })
    fireEvent.click(addWorker)
    fireEvent.click(addWorker)
    const order = container.querySelector(".order") as HTMLElement
    expect(within(order).getByText("Command 0:00")).toBeTruthy()
    expect(within(order).getByText("Command 0:18")).toBeTruthy()
    expect(within(order).queryByText("Command 0:26")).toBeNull()
})

test("Barracks is added before its unit and its training slot is available only after construction", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    const action = container.querySelector(".action-panel") as HTMLElement
    const order = container.querySelector(".order") as HTMLElement
    fireEvent.click(within(action).getByRole("button", { name: /Swordsman/ }))
    expect(within(order).getByText("Barracks")).toBeTruthy()
    fireEvent.click(within(action).getByRole("button", { name: /Swordsman/ }))
    expect(within(order).getByText("Command 0:34")).toBeTruthy()
    expect(within(order).getByText("Command 0:55")).toBeTruthy()
})

test("two completed Barracks have independent training slots", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    const action = container.querySelector(".action-panel") as HTMLElement
    for (const name of [/Barracks/, /Barracks/, /Swordsman/, /Swordsman/]) {
        fireEvent.click(within(action).getByRole("button", { name }))
    }
    const order = container.querySelector(".order") as HTMLElement
    expect(within(order).getAllByText("Command 0:34")).toHaveLength(2)
})

test("initial allocations derive food, and hovering reads exact delivery boundaries", () => {
    const { container } = render(<App />)
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("4")
    expect((screen.getByLabelText("Initial wood gatherers") as HTMLInputElement).value).toBe("1")
    expect(screen.queryByLabelText("Workers available")).toBeNull()
    expect(screen.queryByLabelText("Initial food used")).toBeNull()
    const chart = container.querySelector(".resource-chart") as HTMLElement
    jest.spyOn(chart, "getBoundingClientRect").mockReturnValue({ left: 0, width: 600 } as DOMRect)
    fireEvent.mouseMove(chart, { clientX: 109 })
    expect(within(screen.getByRole("tooltip")).getByText("10.9")).toBeTruthy()
    expect(within(screen.getByRole("tooltip")).getByText("Gold: 150")).toBeTruthy()
    expect(within(screen.getByRole("tooltip")).getByText("Wood: 0")).toBeTruthy()
    expect(within(screen.getByRole("tooltip")).getByText("Food: 10/20")).toBeTruthy()
    fireEvent.mouseMove(chart, { clientX: 110 })
    expect(within(screen.getByRole("tooltip")).getByText("11.0")).toBeTruthy()
    expect(within(screen.getByRole("tooltip")).getByText("Gold: 200")).toBeTruthy()
    expect(container.querySelectorAll(".hover-line").length).toBe(3)
    fireEvent.mouseLeave(chart)
    expect(screen.queryByRole("tooltip")).toBeNull()
    fireEvent.change(screen.getByLabelText("Initial wood gatherers"), { target: { value: "2" } })
    fireEvent.mouseMove(chart, { clientX: 0 })
    expect(within(screen.getByRole("tooltip")).getByText("Food: 12/20")).toBeTruthy()
})

test("the editable construction delay changes building and worker return times", () => {
    const { container } = render(<App />)
    const delay = screen.getByLabelText("Construction start delay (seconds)") as HTMLInputElement
    expect(delay.value).toBe("4")
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    fireEvent.click(
        within(container.querySelector(".action-panel") as HTMLElement).getByRole("button", { name: /Barracks/ }),
    )
    expect(screen.getByTitle("Command 0:00 · start 0:04 · finish 0:34 · worker returns 0:38")).toBeTruthy()
    fireEvent.change(delay, { target: { value: "2.5" } })
    expect(screen.getByTitle("Command 0:00 · start 0:02.5 · finish 0:32.5 · worker returns 0:35")).toBeTruthy()
})
