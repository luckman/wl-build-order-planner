import { saveJson } from "./saveJson"

const originalPicker = Object.getOwnPropertyDescriptor(window, "showSaveFilePicker")
afterEach(() => {
    if (originalPicker) Object.defineProperty(window, "showSaveFilePicker", originalPicker)
    else delete (window as any).showSaveFilePicker
})
function installPicker(picker: jest.Mock) {
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: picker })
}

test("native Save As suggests a JSON filename and writes the selected file", async () => {
    const write = jest.fn().mockResolvedValue(undefined)
    const close = jest.fn().mockResolvedValue(undefined)
    const abort = jest.fn().mockResolvedValue(undefined)
    const picker = jest.fn().mockResolvedValue({ createWritable: async () => ({ write, close, abort }) })
    installPicker(picker)
    expect(await saveJson('{"buildOrder":[]}', "light-build-order.json")).toBe(true)
    expect(picker).toHaveBeenCalledWith({
        id: "wl-build-order-export", suggestedName: "light-build-order.json",
        types: [{ description: "WL build order JSON", accept: { "application/json": [".json"] } }],
    })
    const blob = write.mock.calls[0][0] as Blob
    expect(blob.type).toBe("application/json")
    const text = await new Promise<string>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsText(blob)
    })
    expect(text).toBe('{"buildOrder":[]}')
    expect(close).toHaveBeenCalledTimes(1)
    expect(abort).not.toHaveBeenCalled()
})

test("cancelling native Save As exits without downloading or throwing", async () => {
    installPicker(jest.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")))
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click")
    try {
        expect(await saveJson("{}", "order.json")).toBe(false)
        expect(click).not.toHaveBeenCalled()
    } finally { click.mockRestore() }
})

test("write failures abort the file and propagate an error without falling back to download", async () => {
    const write = jest.fn().mockRejectedValue(new Error("Disk full"))
    const close = jest.fn()
    const abort = jest.fn().mockResolvedValue(undefined)
    installPicker(jest.fn().mockResolvedValue({ createWritable: async () => ({ write, close, abort }) }))
    await expect(saveJson("{}", "order.json")).rejects.toThrow("Disk full")
    expect(abort).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()
})
