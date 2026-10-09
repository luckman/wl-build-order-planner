type SavePickerWindow = Window & {
    showSaveFilePicker?: (options: {
        id: string; suggestedName: string;
        types: Array<{ description: string; accept: Record<string, string[]> }>
    }) => Promise<{
        createWritable: () => Promise<{
            write: (data: Blob) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void>
        }>
    }>
}

/** Called directly from the export click so the native picker retains user activation. */
export async function saveJson(json: string, suggestedName: string): Promise<boolean> {
    const pickerWindow = window as SavePickerWindow
    const blob = new Blob([json], { type: "application/json" })
    if (typeof pickerWindow.showSaveFilePicker === "function") {
        let handle
        try {
            handle = await pickerWindow.showSaveFilePicker({
                id: "wl-build-order-export", suggestedName,
                types: [{ description: "WL build order JSON", accept: { "application/json": [".json"] } }],
            })
        } catch (reason) {
            if (reason instanceof DOMException && reason.name === "AbortError") return false
            throw reason
        }
        const writable = await handle.createWritable()
        try {
            await writable.write(blob)
            await writable.close()
        } catch (reason) {
            await writable.abort().catch(() => {})
            throw reason
        }
        return true
    }
    // Unsupported browsers use their normal download behavior and save-location preferences.
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = suggestedName
    document.body.appendChild(link)
    try { link.click() } finally {
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    return true
}
