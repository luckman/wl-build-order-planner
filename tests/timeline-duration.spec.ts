import { expect, test } from "@playwright/test"

test("worker cards retain their duration as later events extend the timeline", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto("http://localhost:2987")
    await page.getByLabel("Starting gold", { exact: true }).fill("1000")
    const worker = page.locator(".action-panel").getByRole("button", { name: /^Worker / })
    await worker.click()
    await worker.click()

    let originalWidth: number | undefined
    for (const timestamp of ["0600", "0900", "2959"]) {
        if (timestamp === "0600") {
            await page.getByRole("button", { name: "Resources collected", exact: true }).click()
        } else {
            await page.getByRole("button", { name: "Change Resources collected timestamp, action 3" }).click()
        }
        const dialog = page.getByRole("dialog")
        await dialog.getByLabel("Command time (mm:ss)").fill(timestamp)
        await dialog.getByRole("button", { name: timestamp === "0600" ? "Resources collected" : "Save event", exact: true }).click()

        const cards = page.locator(".queue-track .event.unit")
        await expect(cards).toHaveCount(2)
        const first = (await cards.nth(0).boundingBox())!
        const second = (await cards.nth(1).boundingBox())!
        originalWidth ??= first.width
        expect(Math.abs(first.width - originalWidth)).toBeLessThan(1)
        expect(Math.abs(second.width - first.width)).toBeLessThan(1)
        expect(Math.abs(first.x + first.width - second.x)).toBeLessThan(1)
    }
})
