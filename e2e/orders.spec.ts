import { expect, test, type Page, type Route } from "@playwright/test";

const patientUuid = "patient-orders";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

interface Scenario { upload?: "failure"; save?: "success" | "confirmed-failure" | "ambiguous-committed" }

async function mockOrders(page: Page, scenario: Scenario = {}) {
  const captured = { uploads: 0, deletes: [] as string[], saves: [] as Array<Record<string, unknown>>, audits: [] as Array<Record<string, unknown>> };
  const existing = { encounterUuid: "encounter-existing", visitUuid: "visit-1", observations: [{ uuid: "root-existing", orderUuid: "order-1", concept: { uuid: "form" }, groupMembers: [{ uuid: "summary-existing", orderUuid: "order-1", concept: { uuid: "summary" }, groupMembers: [{ uuid: "notes-existing", orderUuid: "order-1", concept: { uuid: "notes" }, value: "Informe previo" }, { uuid: "image-existing", orderUuid: "order-1", concept: { uuid: "image" }, value: "patient/old.jpg", comment: "Frontal" }] }] }] };
  let findCalls = 0;
  await page.route("**/document_images/**", (route) => route.fulfill({ contentType: "image/png", body: png }));
  await page.route("**/openmrs/**", async (route) => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname; const method = request.method();
    if (path.endsWith("/session")) return json(route, { authenticated: true, user: { uuid: "user-1", display: "rad" }, sessionLocation: { uuid: "location-1", display: "Radiología" } });
    if (path.endsWith("/user")) return json(route, { results: [{ uuid: "user-1", username: "rad", display: "rad", privileges: [{ name: "app:orders" }], roles: [], userProperties: { defaultLocale: "es" } }] });
    if (path.endsWith("/provider")) return json(route, { results: [{ uuid: "provider-1", display: "Dra. Radióloga", retired: false, attributes: [] }] });
    if (path.endsWith("/location")) return json(route, { results: [{ uuid: "location-1", display: "Radiología" }] });
    if (path.endsWith("/bahmnicore/sql/globalproperty")) return json(route, "Escape");
    if (path.endsWith(`/patientprofile/${patientUuid}`)) return json(route, { patient: { uuid: patientUuid, identifiers: [{ identifier: "RUN*1-9", preferred: true }], person: { gender: "M", birthdate: "1980-01-01", names: [{ givenName: "Juan", familyName: "Prueba", preferred: true }] } } });
    if (path.endsWith("/ordertype")) return json(route, { results: [{ uuid: "radiology-type", display: "Radiology Order" }] });
    if (path.endsWith("/concept")) return json(route, { results: [{ uuid: "form", name: { name: "Radiology Order Fulfillment Form" }, setMembers: [{ uuid: "summary", display: "Summary", name: { display: "Summary" }, datatype: { name: "N/A" }, conceptClass: { name: "Misc" }, setMembers: [{ uuid: "notes", display: "Radiology Notes", name: { display: "Radiology Notes" }, datatype: { name: "Text" }, conceptClass: { name: "Misc" } }, { uuid: "image", display: "Diagnostic Images", name: { display: "Diagnostic Images" }, datatype: { name: "Complex" }, conceptClass: { name: "Image" } }] }] }] });
    if (path.endsWith("/bahmnicore/orders")) return json(route, [{ orderUuid: "order-1", orderNumber: "ORD-1", concept: "X-ray of skull, two views", provider: "Dra. Radióloga", orderDate: "2026-08-17T10:00:00Z" }]);
    if (path.endsWith("/bahmnicore/bahmniencounter/find")) {
      findCalls += 1;
      if (scenario.save === "ambiguous-committed" && findCalls >= 3) return json(route, { encounterUuid: "encounter-reconciled", visitUuid: "visit-1", observations: [{ orderUuid: "order-1", concept: { uuid: "form" }, groupMembers: [{ orderUuid: "order-1", concept: { uuid: "summary" }, groupMembers: [{ orderUuid: "order-1", concept: { uuid: "notes" }, value: "Informe actualizado" }, { orderUuid: "order-1", concept: { uuid: "image" }, value: "patient/old.jpg", comment: "Frontal" }] }] }] });
      return json(route, existing);
    }
    if (path.endsWith("/bahmnicore/visitDocument/uploadDocument") && method === "POST") {
      captured.uploads += 1;
      if (scenario.upload === "failure") return json(route, { error: { message: "upload rejected" } }, 500);
      return json(route, { url: `patient/uploaded-${captured.uploads}.png` });
    }
    if (path.endsWith("/bahmnicore/visitDocument") && method === "DELETE") { captured.deletes.push(url.searchParams.get("filename") ?? ""); return json(route, {}); }
    if (path.endsWith("/bahmnicore/bahmniencounter") && method === "POST") {
      captured.saves.push(JSON.parse(request.postData() ?? "{}") as Record<string, unknown>);
      if (scenario.save === "confirmed-failure") return json(route, { error: { message: "rejected" } }, 400);
      if (scenario.save === "ambiguous-committed") return route.abort("timedout");
      return json(route, { encounterUuid: "encounter-saved", visitUuid: "visit-1" });
    }
    if (path.endsWith("/auditlog") && method === "POST") { captured.audits.push(JSON.parse(request.postData() ?? "{}") as Record<string, unknown>); return json(route, {}); }
    return json(route, {}, 404);
  });
  return captured;
}

async function openForm(page: Page) {
  await page.goto(`/bahmni/orders/patient/${patientUuid}/fulfillment/${encodeURIComponent("Radiology Order")}`);
  await expect(page.getByText("Con resultados", { exact: true })).toBeVisible();
  await page.getByText("X-ray of skull, two views").click();
  await expect(page.locator("textarea").first()).toHaveValue("Informe previo");
  await expect(page.getByAltText("old.jpg")).toBeVisible();
}

test("orders keeps selection local until Save and persists provider, existing UUIDs and audit", async ({ page }) => {
  const captured = await mockOrders(page);
  await openForm(page);
  await page.locator("input[type=file]").setInputFiles({ name: "new.png", mimeType: "image/png", buffer: png });
  expect(captured.uploads).toBe(0);
  await page.locator("textarea").first().fill("Informe actualizado");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Resultados guardados correctamente.")).toBeVisible();
  expect(captured.uploads).toBe(1);
  expect(captured.saves[0]).toMatchObject({ patientUuid, locationUuid: "location-1", providers: [{ uuid: "provider-1" }], observations: [{ uuid: "root-existing", orderUuid: "order-1" }] });
  expect(JSON.stringify(captured.saves[0])).toContain("notes-existing");
  expect(captured.audits).toEqual([expect.objectContaining({ eventType: "EDIT_ENCOUNTER", patientUuid, module: "MODULE_LABEL_ORDERS_KEY" })]);
});

test("orders cancel or abandon after selecting a file performs no server write", async ({ page }) => {
  const captured = await mockOrders(page);
  await openForm(page);
  await page.locator("input[type=file]").setInputFiles({ name: "temporary.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("temporary.png")).toBeVisible();
  await page.reload();
  expect(captured.uploads).toBe(0); expect(captured.saves).toHaveLength(0); expect(captured.deletes).toHaveLength(0);
});

test("orders cleans an upload after a confirmed pre-commit failure", async ({ page }) => {
  const captured = await mockOrders(page, { save: "confirmed-failure" });
  await openForm(page);
  await page.locator("input[type=file]").setInputFiles({ name: "new.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("new.png")).toBeVisible();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("rejected", { exact: true })).toBeVisible();
  expect(captured.uploads).toBe(1); expect(captured.saves).toHaveLength(1);
  await expect.poll(() => captured.deletes).toEqual(["patient/uploaded-1.png"]); expect(captured.audits).toHaveLength(0);
});

test("orders stops without encounter persistence when the file upload fails", async ({ page }) => {
  const captured = await mockOrders(page, { upload: "failure" });
  await openForm(page);
  await page.locator("input[type=file]").setInputFiles({ name: "new.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("upload rejected", { exact: true })).toBeVisible();
  expect(captured.uploads).toBe(1);
  expect(captured.saves).toHaveLength(0);
  expect(captured.deletes).toHaveLength(0);
  expect(captured.audits).toHaveLength(0);
});

test("orders reconciles an ambiguous post-commit timeout without delete or retry", async ({ page }) => {
  const captured = await mockOrders(page, { save: "ambiguous-committed" });
  await openForm(page);
  await page.locator("textarea").first().fill("Informe actualizado");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Resultados guardados correctamente.")).toBeVisible();
  expect(captured.saves).toHaveLength(1); expect(captured.deletes).toHaveLength(0);
  expect(captured.audits).toEqual([expect.objectContaining({ eventType: "EDIT_ENCOUNTER" })]);
});
