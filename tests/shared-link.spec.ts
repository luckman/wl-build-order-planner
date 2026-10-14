import { expect, test } from "@playwright/test"
import { createShareableLink } from "../src/game/shareableLink"
import { initialGameProfile } from "../src/game/gameProfile"

test("open shared link, edit, and reload retains the edited plan and profile", async ({ page }) => {
    const link = createShareableLink("http://localhost:2987/?view=planner", "light", initialGameProfile, [])
    await page.goto(link)
    await expect(page.getByRole("status")).toContainText("Shared build order")
    await expect(page).toHaveURL("http://localhost:2987/?view=planner")
    await page.getByLabel("Starting gold", { exact: true }).fill("777")
    await page.getByRole("button", { name: /^Worker \d+ gold/ }).click()
    await expect(page.getByRole("button", { name: "Remove Worker", exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByLabel("Starting gold", { exact: true })).toHaveValue("777")
    await expect(page.getByRole("button", { name: "Remove Worker", exact: true })).toBeVisible()
    await expect(page.getByRole("status")).toHaveCount(0)
    await expect(page).toHaveURL("http://localhost:2987/?view=planner")
})
