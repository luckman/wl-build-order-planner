import { expect, type Page } from "@playwright/test"

export async function selectFaction(page: Page, name: string) {
    const button = page.getByRole("button", { name, exact: true })
    await button.click()
    await expect(button).toHaveClass("selected")
}
