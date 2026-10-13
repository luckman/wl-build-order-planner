import { fireEvent, render, screen, within } from "@testing-library/react"
import App from "./App"

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

test("Mana graph reports starting mana and exact regeneration times with capacity", () => {
    const { container } = render(<App />)
    const graph = screen.getByLabelText("Food and mana graph")
    expect((screen.getByLabelText("Starting mana") as HTMLInputElement).value).toBe("35")
    expect((screen.getByLabelText("Base mana capacity") as HTMLInputElement).value).toBe("50")
    jest.spyOn(graph, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1200 } as DOMRect)
    for (const [clientX, amount] of [[0, 35], [59, 35], [60, 36], [299, 39], [300, 40], [600, 45], [1200, 50]]) {
        fireEvent.mouseMove(graph, { clientX })
        expect(within(screen.getByRole("tooltip")).getByText(`Mana: ${amount}/50`)).toBeTruthy()
        expect(container.querySelector(".resource-legend-row:nth-child(3) .resource-value")!.textContent).toBe(`${amount} / 50`)
    }
    fireEvent.mouseLeave(graph)
    fireEvent.change(screen.getByLabelText("Tower of Mana level"), { target: { value: "24" } })
    expect(screen.getByText(/Mana capacity per Tower of Mana: \+55/)).toBeTruthy()
})
