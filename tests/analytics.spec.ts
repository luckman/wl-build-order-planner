import { expect, test } from "@playwright/test"

test("the bundled GoatCounter script counts pageviews and shared links with the former host blocked", async ({
    context,
    page,
}) => {
    const origin = "http://localhost:2987"
    const projectPath = "/wl-build-order-planner/"
    const plannerUrl = origin + projectPath
    const counts: URLSearchParams[] = []

    // Mount the built planner under a project path like its GitHub Pages deployment.
    await context.route(`${plannerUrl}**`, async (route) => {
        const url = new URL(route.request().url())
        url.pathname = `/${url.pathname.slice(projectPath.length)}`
        await route.fulfill({ response: await route.fetch({ url: url.href }) })
    })
    await context.route(
        (url) => url.hostname === "gc.zgo.at",
        (route) => route.abort("blockedbyclient"),
    )
    await context.route(
        (url) => url.origin === "https://luckman.goatcounter.com" && url.pathname === "/count",
        async (route) => {
            counts.push(new URL(route.request().url()).searchParams)
            await route.fulfill({ status: 204 })
        },
    )
    await context.addInitScript(() => {
        Object.assign(window, { goatcounter: { allow_local: true } })
    })
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin })

    const [scriptResponse] = await Promise.all([
        page.waitForResponse(`${plannerUrl}count.js`, { timeout: 5000 }),
        page.goto(plannerUrl),
    ])
    expect(scriptResponse.ok()).toBe(true)
    await expect.poll(() => counts.some((count) => count.get("p") === projectPath && !count.has("e"))).toBe(true)

    await page.getByText("Share / Import", { exact: true }).click()
    await page.getByRole("button", { name: "Copy link", exact: true }).click()
    await expect(page.getByRole("status")).toContainText("Shareable link copied to clipboard.")
    await expect.poll(() => counts.some((count) => count.get("p") === "copy-link")).toBe(true)
    const link = await page.evaluate(() => navigator.clipboard.readText())
    await page.goto(link)
    await expect(page.getByRole("status")).toContainText("Shared build order")

    await expect
        .poll(() =>
            counts
                .filter((count) => count.get("e") === "true")
                .map((count) => ({
                    path: count.get("p"),
                    title: count.get("t"),
                    noSession: count.get("ns"),
                })),
        )
        .toEqual([
            { path: "copy-link", title: "Copy link", noSession: "true" },
            { path: "open-build-link", title: "Open build link", noSession: "true" },
        ])
})
