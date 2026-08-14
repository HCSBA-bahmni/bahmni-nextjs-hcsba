import { expect, test } from "@playwright/test";

test("post-logout landing does not immediately recreate the SSO session", async ({ page }) => {
  let oidcStarts = 0;
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ authenticated: false }),
  }));
  await page.route("**/openmrs/oauth2login", (route) => {
    oidcStarts += 1;
    return route.fulfill({ status: 204 });
  });

  await page.goto("/bahmni/login?loggedOut=1");
  await expect(page.getByText("Tu sesión se cerró correctamente.")).toBeVisible();
  await page.waitForTimeout(300);
  expect(oidcStarts).toBe(0);

  await page.getByRole("button", { name: "Volver a iniciar sesión" }).click();
  await expect.poll(() => oidcStarts).toBe(1);
});
