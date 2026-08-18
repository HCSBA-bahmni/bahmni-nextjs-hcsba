import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const session = (location: boolean) => ({
  authenticated: true,
  user: { uuid: "user-1", display: "doctor" },
  sessionLocation: location ? { uuid: "location-1", display: "Urgencia" } : null,
});

const user = {
  uuid: "user-1",
  username: "doctor",
  display: "Profesional sintético",
  privileges: [],
  roles: [],
  userProperties: { defaultLocale: "es" },
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockStaticConfiguration(page: Page) {
  await page.route("**/cgi-bin/systemdate", (route) => json(route, {}));
  await page.route("**/implementation_config/**", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni_config/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("locale_languages.json")) {
      return json(route, { locales: [{ code: "es", nativeName: "Español" }] });
    }
    return json(route, {});
  });
  await page.route("**/bahmni/i18n/**", (route) => json(route, {}));
}

async function mockAuthenticatedOpenMrs(page: Page, onPassword?: (body: unknown) => void) {
  await mockStaticConfiguration(page);
  await page.route("**/openmrs/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/ws/rest/v1/session")) return json(route, session(true));
    if (url.pathname.endsWith("/ws/rest/v1/user")) return json(route, { results: [user] });
    if (url.pathname.endsWith("/ws/rest/v1/provider")) {
      return json(route, { results: [{ uuid: "provider-1", display: "Profesional sintético", attributes: [] }] });
    }
    if (url.pathname.endsWith("/ws/rest/v1/location")) {
      return json(route, { results: [{ uuid: "location-1", display: "Urgencia" }] });
    }
    if (url.pathname.endsWith("/passwordPolicyProperties")) {
      return json(route, {
        "security.passwordMinimumLength": "10",
        "security.passwordRequiresDigit": "true",
        "security.passwordRequiresNonDigit": "true",
        "security.passwordRequiresUpperAndLowerCase": "true",
      });
    }
    if (url.pathname.endsWith("/ws/rest/v1/password") && request.method() === "POST") {
      onPassword?.(request.postDataJSON());
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith("/ws/rest/v1/bahmnicore/sql/globalproperty")) return json(route, "");
    if (url.pathname.endsWith("/ws/rest/v1/auditlog")) return route.fulfill({ status: 204 });
    return json(route, {});
  });
}

test("OpenMRS OTP, Provider and location selection preserve the legacy contract", async ({ page }) => {
  await mockStaticConfiguration(page);
  let authenticated = false;
  let locationSelected = false;
  let firstFactorRequests = 0;
  let secondFactorRequests = 0;

  await page.route("**/openmrs/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/ws/rest/v1/session") && request.method() === "GET") {
      const authorization = request.headers().authorization;
      if (!authorization) return json(route, authenticated ? session(locationSelected) : { authenticated: false });
      const decoded = Buffer.from(authorization.replace(/^Basic /, ""), "base64").toString("utf8");
      if (decoded === "doctor:secret") {
        firstFactorRequests += 1;
        return route.fulfill({ status: 204 });
      }
      if (decoded === "doctor:secret:123456") {
        secondFactorRequests += 1;
        authenticated = true;
        return json(route, session(false));
      }
      return json(route, { authenticated: false });
    }
    if (url.pathname.endsWith("/ws/rest/v1/session") && request.method() === "POST") {
      expect(request.postDataJSON()).toMatchObject({ sessionLocation: "location-1", locale: "es" });
      locationSelected = true;
      return json(route, session(true));
    }
    if (url.pathname.endsWith("/ws/rest/v1/user")) return json(route, { results: [user] });
    if (url.pathname.endsWith("/ws/rest/v1/provider")) {
      return json(route, { results: [{ uuid: "provider-1", display: "Profesional sintético", attributes: [] }] });
    }
    if (url.pathname.endsWith("/ws/rest/v1/location")) {
      return json(route, { results: [{ uuid: "location-1", display: "Urgencia" }] });
    }
    if (url.pathname.endsWith("/ws/rest/v1/bahmnicore/sql/globalproperty")) return json(route, "");
    if (url.pathname.endsWith("/ws/rest/v1/auditlog")) return route.fulfill({ status: 204 });
    return json(route, {});
  });

  await page.goto("/bahmni/login?returnUrl=%2Fchange-password");
  await page.getByLabel("Usuario").fill("doctor");
  await page.getByLabel("Contraseña", { exact: true }).fill("secret");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByLabel("Código de verificación")).toBeVisible();
  await page.getByLabel("Código de verificación").fill("123456");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/bahmni\/location/);
  await page.locator(".p-dropdown").click();
  await page.getByRole("option", { name: "Urgencia" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/bahmni\/change-password$/);
  expect(firstFactorRequests).toBe(1);
  expect(secondFactorRequests).toBe(1);
  expect(locationSelected).toBe(true);
});

test("change password renders server policies and sends the exact payload", async ({ page }) => {
  let passwordPayload: unknown;
  await mockAuthenticatedOpenMrs(page, (body) => { passwordPayload = body; });

  await page.goto("/bahmni/change-password");
  await expect(page.getByRole("heading", { name: "Cambiar contraseña" })).toBeVisible();
  await expect(page.getByText("Debe tener un mínimo de 10 caracteres.")).toBeVisible();
  await expect(page.getByText("Debe contener al menos un número.")).toBeVisible();

  await page.getByLabel("Contraseña actual").fill("anterior");
  await page.getByLabel("Nueva contraseña").fill("Nueva-clave-1");
  await page.getByLabel("Confirmar contraseña").fill("distinta");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
  expect(passwordPayload).toBeUndefined();

  await page.getByLabel("Confirmar contraseña").fill("Nueva-clave-1");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("status")).toContainText("se cambió correctamente");
  expect(passwordPayload).toEqual({ oldPassword: "anterior", newPassword: "Nueva-clave-1" });
  await expect(page.getByLabel("Contraseña actual")).toHaveValue("");

  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("an expired OpenMRS session keeps only a local return URL", async ({ page }) => {
  await mockAuthenticatedOpenMrs(page);
  await page.goto("/bahmni/change-password");
  await expect(page.getByRole("heading", { name: "Cambiar contraseña" })).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("bahmni:unauthorized")));

  await expect(page).toHaveURL(/\/bahmni\/login\?sessionExpired=1&returnUrl=%2Fchange-password$/);
  await expect(page.locator(".error-banner[role=alert]")).toContainText("sesión expiró");
});
