import { fireEvent, render, screen, within } from "@testing-library/react"
import App from "./App"

test("resource collection follows the timeline and advanced settings retain edits when hidden", () => {
    const { container } = render(<App />)
    const panels = Array.from(container.querySelectorAll(".planner-area > section"))
    expect(panels[0].classList.contains("timeline")).toBe(true)
    expect(panels[1].classList.contains("economy")).toBe(true)
    expect((screen.getByLabelText("Starting wood") as HTMLInputElement).value).toBe("50")
    expect(screen.queryByLabelText("Initial gold miners")).toBeNull()
    expect(screen.getByText("Initial gold miners: 4 · Initial wood gatherers: 1")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    fireEvent.change(screen.getByLabelText("Initial gold miners"), { target: { value: "3" } })
    expect(screen.getByLabelText("Initial order delay (seconds)")).toBeTruthy()
    expect(screen.queryByLabelText("Gold gathering time (seconds)")).toBeNull()
    expect(screen.queryByLabelText("Initial gold travel reduction (seconds)")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Hide advanced" }))
    expect(screen.queryByLabelText("Initial gold miners")).toBeNull()
    expect(screen.getByText("Initial gold miners: 3 · Initial wood gatherers: 1")).toBeTruthy()
    expect(screen.getByLabelText("Starting gold")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("3")
})

test("Miriel appears under Heroes, consumes food, and removing her releases the recruitment limit", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "100000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "100000" } })
    const heading = screen.getByRole("heading", { name: "heroes" })
    const hero = within(heading.parentElement!).getByRole("button", { name: /Miriel/ })
    fireEvent.click(hero)
    const summary = container.querySelector(".resource-summary") as HTMLElement
    expect(within(summary).getByText("20 / 40")).toBeTruthy()
    expect(Array.from(container.querySelectorAll(".queue-label")).some(label => label.textContent === "Altar of Heroes")).toBe(true)
    expect(container.querySelector(".event.hero")).toBeTruthy()
    fireEvent.click(hero)
    expect(screen.getByRole("alert").textContent).toContain("Miriel limit reached")
    fireEvent.click(screen.getByRole("button", { name: "Remove Miriel" }))
    fireEvent.click(hero)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getAllByRole("button", { name: "Remove Miriel" })).toHaveLength(1)
})

test("duplicate upgrades are rejected until another Castle is explicitly added", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "100000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "100000" } })
    const actions = within(container.querySelector(".action-panel") as HTMLElement)
    const upgrade = actions.getByRole("button", { name: /Castle lvl 2/ })
    fireEvent.click(upgrade)
    fireEvent.click(upgrade)
    expect(screen.getByRole("alert").textContent).toBe("Requires another Castle")
    const order = container.querySelector(".order") as HTMLElement
    expect(within(order).getAllByText("Castle lvl 2")).toHaveLength(1)
    fireEvent.click(actions.getByRole("button", { name: /^Castle 500 gold/ }))
    fireEvent.click(upgrade)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(within(order).getAllByText("Castle lvl 2")).toHaveLength(2)
})

test("adding a second Farm inserts the needed upgrade and removal explains blocked orders", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "100000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "100000" } })
    const actions = within(container.querySelector(".action-panel") as HTMLElement)
    const farm = actions.getByRole("button", { name: /^Farm/ })
    fireEvent.click(farm)
    fireEvent.click(farm)
    const order = container.querySelector(".order") as HTMLElement
    expect(within(order).getAllByText("Farm")).toHaveLength(2)
    expect(within(order).getByText("Castle lvl 2")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Remove Castle lvl 2" }))
    expect(within(order).getByText("Farm limit reached at the current town-hall level")).toBeTruthy()
})

test("Barracks prices and resource totals update when orders are added or removed", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    fireEvent.change(screen.getByLabelText("Initial gold miners"), { target: { value: "0" } })
    fireEvent.change(screen.getByLabelText("Initial wood gatherers"), { target: { value: "3" } })
    const button = within(container.querySelector(".action-panel") as HTMLElement).getByRole("button", { name: /Barracks/ })
    fireEvent.click(button)
    expect(button.textContent).toContain("400 gold · 300 wood")
    fireEvent.click(button)
    expect(button.textContent).toContain("600 gold · 450 wood")
    const summary = container.querySelector(".resource-summary") as HTMLElement
    expect(within(summary).getByText("1400")).toBeTruthy()
    expect(within(summary).getByText("1550")).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "Remove Barracks" })[0])
    expect(button.textContent).toContain("400 gold · 300 wood")
    expect(within(summary).getAllByText("1800")).toHaveLength(1)
    expect(within(summary).getByText("1850")).toBeTruthy()
})

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
    expect(within(order).getByText("Command 0:01")).toBeTruthy()
    expect(within(order).getByText("Command 0:19")).toBeTruthy()
    expect(within(order).queryByText("Command 0:27")).toBeNull()
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
    expect(within(order).getByText("Command 0:35")).toBeTruthy()
    expect(within(order).getByText("Command 0:56")).toBeTruthy()
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
    expect(within(order).getAllByText("Command 0:35")).toHaveLength(2)
})

test("initial allocations derive food, and hovering reads exact delivery boundaries", () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect((screen.getByLabelText("Initial gold miners") as HTMLInputElement).value).toBe("4")
    expect((screen.getByLabelText("Initial wood gatherers") as HTMLInputElement).value).toBe("1")
    expect(screen.queryByLabelText("Workers available")).toBeNull()
    expect(screen.queryByLabelText("Initial food used")).toBeNull()
    const chart = container.querySelector(".resource-chart") as HTMLElement
    jest.spyOn(chart, "getBoundingClientRect").mockReturnValue({ left: 0, width: 900 } as DOMRect)
    fireEvent.mouseMove(chart, { clientX: 100 })
    expect(within(screen.getByRole("tooltip")).getByText("0:10.0")).toBeTruthy()
    expect(within(screen.getByRole("tooltip")).getByText("Gold: 150")).toBeTruthy()
    expect(within(screen.getByRole("tooltip")).getByText("Wood: 50")).toBeTruthy()
    expect(within(screen.getByRole("tooltip")).getByText("Food: 10/20")).toBeTruthy()
    fireEvent.mouseMove(chart, { clientX: 101 })
    expect(within(screen.getByRole("tooltip")).getByText("0:10.1")).toBeTruthy()
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
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    const delay = screen.getByLabelText("Construction start delay (seconds)") as HTMLInputElement
    expect(delay.value).toBe("4")
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    fireEvent.click(
        within(container.querySelector(".action-panel") as HTMLElement).getByRole("button", { name: /Barracks/ }),
    )
    expect(screen.getByTitle("Command 0:01 · start 0:05 · finish 0:35 · worker returns 0:39")).toBeTruthy()
    fireEvent.change(delay, { target: { value: "2.5" } })
    expect(screen.getByTitle("Command 0:01 · start 0:03.5 · finish 0:33.5 · worker returns 0:36")).toBeTruthy()
})

test("town hall upgrades show builder travel and return time in the construction timeline", () => {
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText("Starting gold"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("Starting wood"), { target: { value: "2000" } })
    fireEvent.click(
        within(container.querySelector(".action-panel") as HTMLElement).getByRole("button", { name: /Castle lvl 2/ }),
    )

    expect(container.querySelector(".event.upgrade")?.getAttribute("title")).toBe(
        "Command 0:35 · start 0:39 · finish 1:24 · worker returns 1:28",
    )
})
