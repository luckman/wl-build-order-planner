import { fireEvent, render, screen } from "@testing-library/react"
import EventTimeDialog from "./EventTimeDialog"
import GoldMinerLimitDialog from "./GoldMinerLimitDialog"
import ManualWorkerMoveDialog from "./ManualWorkerMoveDialog"
import WorkerEventDialog from "./WorkerEventDialog"

const close = () => {}
const save = () => {}

test("gold limit explanation remains visible when the reassignment checkbox changes or is hidden", () => {
    render(<GoldMinerLimitDialog defaultTime={1} items={[]} profileLimit={4} goldAssignmentsBefore={() => 4}
        openingGoldWorkers={4} canBeFirstAtOpening={false} onClose={close} onSave={save} />)
    const note = "When checked, existing workers switch between gold and wood to meet the limit. When unchecked, new gold slots are filled by recruits."
    expect(screen.getByText(note)).toBeTruthy()
    const limit = screen.getByLabelText("Gold miner limit")
    fireEvent.change(limit, { target: { value: "5" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Reassign existing workers" }))
    expect(screen.getByText(note)).toBeTruthy()
    fireEvent.change(limit, { target: { value: "4" } })
    expect(screen.queryByRole("checkbox", { name: "Reassign existing workers" })).toBeNull()
    expect(screen.getByText(note)).toBeTruthy()
})

test.each([
    ["move-gold-miner-to-wood", "Miners deliver their gold before moving to wood. The gold miner limit stays unchanged."],
    ["move-wood-gatherer-to-gold", "Workers travelling to the forest switch immediately. Others finish and deliver their wood first."],
] as const)("%s explains the move", (type, note) => {
    render(<ManualWorkerMoveDialog type={type} defaultTime={1} onClose={close} onSave={save} />)
    expect(screen.getByText(note)).toBeTruthy()
})

test.each([
    ["make-idle", "Workers stop gathering immediately."],
    ["make-active", "Workers return to their previous resource after reactivation travel. If the gold miner limit is full, former miners gather wood."],
] as const)("%s explains the worker event", (type, note) => {
    render(<WorkerEventDialog type={type} faction="light" defaultTime={1} onClose={close} onSave={save} />)
    expect(screen.getByText(note)).toBeTruthy()
})

test("other event dialogs retain the general message", () => {
    render(<EventTimeDialog name="Example" commandTime={1} onClose={close} onSave={save} />)
    expect(screen.getByText("The plan recalculates when saved and shows any timing conflicts.")).toBeTruthy()
})
