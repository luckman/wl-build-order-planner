import EventTimeDialog from "./EventTimeDialog"
import { WOOD_RETURN_NAME, type WoodReturnAction, type WoodReturnCommand } from "./game/woodReturn"

export default function WoodReturnDialog({ action, defaultTime, onClose, onSave, validationError }: {
    action?: WoodReturnAction; defaultTime: number; validationError?: string | null
    onClose: () => void; onSave: (command: WoodReturnCommand) => void
}) {
    return <EventTimeDialog name={WOOD_RETURN_NAME} title={action ? `Edit ${WOOD_RETURN_NAME}` : WOOD_RETURN_NAME}
        commandTime={action?.commandTime ?? defaultTime} submitLabel={action ? "Save event" : "Add event"}
        onClose={onClose} validateTime={() => validationError ?? null}
        onSave={commandTime => onSave({ type: "bring-wood-back-to-base", commandTime, mode: "immediate" })}>
        <label><input type="radio" name="wood-return-mode" checked readOnly /> Return immediately</label>
    </EventTimeDialog>
}
