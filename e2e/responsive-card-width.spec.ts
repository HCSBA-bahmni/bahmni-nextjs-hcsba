import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Isolated geometry regression with production CSS, no server or patient records.
const styles = [
  "node_modules/primereact/resources/themes/lara-light-blue/theme.css",
  "node_modules/primereact/resources/primereact.min.css",
  "node_modules/primeflex/primeflex.css",
  ...["globals", "consultation-documents", "consultation-diagnosis", "consultation-orders",
    "orders", "allergies", "medication", "ipd", "appointments", "document-upload",
    "admin-audit-log", "admin-beds", "visual-system"].map((name) => `src/styles/${name}.css`),
].map((file) => fs.readFileSync(path.resolve(file), "utf8")).join("\n");

const card = (text: string) => `<div class="clinical-dashboard-item"><div><section class="clinical-card clinical-card-half"><div class="p-card clinical-dashboard-card"><header class="clinical-card-header"><h2>${text}</h2></header><div class="p-card-body">Sin datos registrados.</div></div></section></div></div>`;
const columns = `<div class="clinical-dashboard-layout"><div class="clinical-dashboard-columns"><div class="clinical-dashboard-column">${card("Signos vitales")}${card("Diagnostico")}</div><div class="clinical-dashboard-column">${card("Informacion adicional con titulo mas largo")}${card("Programas")}</div></div></div>`;

test("mobile ADT shrinks intrinsic content and registration actions stay in flow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`<style>${styles}</style><div class="app-shell"><main class="page-container adt-page"><div class="adt-workspace"><aside>Paciente de prueba</aside><div class="adt-main-column"><section class="panel adt-action-panel">Movimiento</section><div style="overflow-x:auto"><table style="min-width:700px"><tr><td>Detalle de admision</td></tr></table></div>${columns}</div></div><form class="patient-registration-form"><div class="actions"><button>Guardar</button></div></form></main></div>`);
  const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, wide: [...document.querySelectorAll("body *")].filter((node) => node.getBoundingClientRect().right > innerWidth).map((node) => ({ cls: node.className, width: node.getBoundingClientRect().width })) }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
  const available = await page.locator(".adt-workspace").evaluate((node) => node.getBoundingClientRect().width);
  for (const item of await page.locator(".clinical-card").all()) {
    expect(Math.abs((await item.boundingBox())!.width - available)).toBeLessThanOrEqual(1);
  }
  await expect(page.locator(".patient-registration-form > .actions")).toHaveCSS("position", "static");
});

test("registration step connectors remain below every active step", async ({ page }) => {
  for (const width of [390, 900, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const active of [0, 1, 2]) {
      await page.setContent(`<style>${styles}</style><nav class="panel patient-form-steps"><div class="p-steps p-component"><ol>${["Identificacion y datos personales", "Direccion", "Informacion adicional"].map((label, index) => `<li class="p-steps-item ${index === active ? "p-highlight" : ""}"><a class="p-menuitem-link" href="#step-${index}"><span class="p-steps-number">${index + 1}</span><span class="p-steps-title">${label}</span></a></li>`).join("")}</ol></div></nav>`);
      await expect(page.locator(".p-highlight .p-menuitem-link")).toHaveCSS("background-color", "rgb(255, 255, 255)");
      const layers = await page.locator(".p-highlight").evaluate((node) => ({
        line: getComputedStyle(node, "::before").zIndex,
        surface: getComputedStyle(node.querySelector(".p-menuitem-link")!).zIndex,
      }));
      expect(Number(layers.surface)).toBeGreaterThan(Number(layers.line));
      const sizes = await page.locator(".p-menuitem-link").evaluateAll((nodes) => nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, fits: node.scrollHeight <= node.clientHeight + 1 };
      }));
      expect(Math.max(...sizes.map((size) => size.width)) - Math.min(...sizes.map((size) => size.width)), JSON.stringify({ width, sizes })).toBeLessThanOrEqual(1);
      expect(Math.max(...sizes.map((size) => size.height)) - Math.min(...sizes.map((size) => size.height))).toBeLessThanOrEqual(1);
      expect(sizes.every((size) => size.fits)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

for (const width of [390, 900, 1280, 1920]) {
  test(`Programs detail uses shared width and section headers at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(`<style>${styles}</style><div class="app-shell"><main class="page-container">
      <header class="app-page-heading"><h1>Programas</h1></header>
      <div class="program-patient-workspace hcsba-patient-workspace"><aside class="panel hcsba-patient-sidebar"><div class="patient-context-identity"><div><h2>Paciente de prueba</h2></div></div></aside><div class="hcsba-patient-content">
      <section class="program-section program-enrollment-section"><header><h2>Enrolamiento en nuevo tratamiento</h2><button class="p-button p-button-text">Abrir</button></header></section>
      <section class="program-section"><header><h2>Programas activos</h2><span>0</span></header><p class="program-empty">Sin programas activos.</p></section>
      <section class="program-section"><header><h2>Programas historicos</h2><span>0</span></header><p class="program-empty">Sin programas finalizados.</p></section>
      </div></div></main></div>`);
    const bounds = await page.locator(".page-container").evaluate((node) => ({
      available: node.clientWidth - parseFloat(getComputedStyle(node).paddingLeft) - parseFloat(getComputedStyle(node).paddingRight),
      workspace: node.querySelector(".program-patient-workspace")!.getBoundingClientRect().width,
    }));
    expect(Math.abs(bounds.available - bounds.workspace)).toBeLessThanOrEqual(1);
    for (const header of await page.locator(".program-section > header").all()) {
      await expect(header).toHaveCSS("background-image", "linear-gradient(110deg, rgb(7, 93, 115), rgb(8, 123, 150))");
      await expect(header.locator("h2")).toHaveCSS("color", "rgb(255, 255, 255)");
    }
    await expect(page.getByRole("button", { name: "Abrir" })).toHaveCSS("color", "rgb(255, 255, 255)");
    await page.getByRole("button", { name: "Abrir" }).hover();
    await expect(page.getByRole("button", { name: "Abrir" })).toHaveCSS("color", "rgb(255, 255, 255)");
    expect((await page.locator(".program-empty").first().boundingBox())!.height).toBeLessThan(90);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("navigation links use outlined palette and search icons have an inner inset", async ({ page }) => {
  await page.setContent(`<style>${styles}</style><div class="app-shell"><form class="clinical-search-form"><span class="p-input-icon-left"><i class="pi pi-search">O</i><input class="p-inputtext" placeholder="Buscar"></span></form><nav class="clinical-links"><a href="#visit">Visita</a></nav></div>`);
  const link = page.getByRole("link", { name: "Visita" });
  await expect(link).toHaveCSS("color", "rgb(8, 108, 133)");
  await expect(link).toHaveCSS("border-top-color", "rgb(8, 108, 133)");
  await link.hover();
  await expect(link).toHaveCSS("color", "rgb(7, 93, 115)");
  const inset = await page.locator(".p-input-icon-left").evaluate((node) => {
    const icon = node.querySelector("i")!, input = node.querySelector("input")!;
    return { icon: icon.getBoundingClientRect().left - input.getBoundingClientRect().left, padding: parseFloat(getComputedStyle(input).paddingLeft) };
  });
  expect(inset.icon).toBeGreaterThanOrEqual(10);
  expect(inset.padding).toBeGreaterThan(inset.icon + 16);
});

for (const width of [390, 700, 1024, 1280]) {
  test(`appointment date controls do not overlap and dialog fields fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<style>${styles}</style><main class="page-container appointments-page"><div class="appointments-content"><div class="appointments-content-main">
      <div class="appointments-date-toolbar"><button class="p-button p-button-outlined">Hoy</button><button class="p-button p-button-outlined">Semana</button><button class="p-button p-button-outlined">Dia</button>
      <span class="appointments-date-center"><button class="p-button p-button-outlined">&lt;</button><span class="p-calendar p-component"><input class="p-inputtext" value="16/10/2026"><button class="p-button">Fecha</button></span><button class="p-button p-button-outlined">&gt;</button></span></div>
      <section id="calendar">Calendario de prueba</section></div></div></main>`);
    const controls = await page.locator(".appointments-date-toolbar > button, .appointments-date-center").evaluateAll((nodes) => nodes.map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height };
    }));
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i]!, b = controls[j]!;
      expect(a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1).toBe(false);
    }
    const before = await page.locator("#calendar").boundingBox();
    await page.locator("body").evaluate((node) => node.insertAdjacentHTML("beforeend", `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center"><div class="p-dialog appointment-create-dialog"><div class="p-dialog-content"><section class="appointment-form-embedded"><form class="appointment-form"><div class="form-grid"><label class="field">Servicio<input class="p-inputtext"></label><label class="field">Fecha<input class="p-inputtext"></label></div></form></section></div></div></div>`));
    expect(await page.locator("#calendar").boundingBox()).toEqual(before);
    const dialog = await page.locator(".appointment-create-dialog").boundingBox();
    await expect(page.locator(".appointment-create-dialog")).toHaveCSS("border-left-width", "1px");
    await expect(page.locator(".appointment-create-dialog")).toHaveCSS("border-left-style", "solid");
    expect(dialog!.width).toBeLessThanOrEqual(width);
    const fields = await page.locator(".appointment-create-dialog .field").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().y));
    if (width <= 700) expect(fields[1]).toBeGreaterThan(fields[0]!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("primary and outlined buttons share the palette and press states", async ({ page }) => {
  await page.setContent(`<style>${styles}</style><div class="registration-search-panel"><div class="registration-search-actions">
    <button class="p-button" id="primary">Buscar</button>
    <button class="p-button p-button-secondary" id="biometric">Buscar por rostro</button>
    <button class="p-button p-disabled" disabled id="disabled">Buscar deshabilitado</button>
    <button class="p-button p-button-outlined" id="outlined">Limpiar</button>
    </div></div><button class="p-button" id="outside">Otra pagina</button>`);
  const primary = page.locator("#primary");
  await expect(primary).toHaveCSS("background-color", "rgb(8, 108, 133)");
  await expect(page.locator("#biometric")).toHaveCSS("background-color", "rgb(8, 108, 133)");
  await expect(page.locator("#disabled")).toBeDisabled();
  await expect(page.locator("#disabled")).toHaveCSS("background-color", "rgb(8, 108, 133)");
  await expect(page.locator("#outside")).toHaveCSS("background-color", "rgb(8, 108, 133)");
  await page.locator("#outside").hover();
  await expect(page.locator("#outside")).toHaveCSS("background-color", "rgb(7, 93, 115)");
  await expect(page.locator("#outlined")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator("#outlined")).toHaveCSS("color", "rgb(8, 108, 133)");
  await expect(page.locator("#outlined")).toHaveCSS("border-top-color", "rgb(8, 108, 133)");
  await primary.hover();
  await expect(primary).toHaveCSS("background-color", "rgb(7, 93, 115)");
  await page.mouse.down();
  await expect(primary).toHaveCSS("background-color", "rgb(6, 79, 98)");
  await expect(primary).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 1)");
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(primary).toHaveCSS("transition-duration", "0s");
});

test("semantic actions and dark header buttons keep their contrast", async ({ page }) => {
  await page.setContent(`<style>${styles}</style>
    <button class="p-button p-button-danger" id="danger">Eliminar</button>
    <button class="p-button p-button-success" id="success">Aceptar</button>
    <button class="p-button p-button-warning" id="warning">Advertencia</button>
    <div class="clinical-dashboard-card"><header class="clinical-card-header"><button class="p-button p-button-text" id="header-button">Expandir</button></header></div>`);
  for (const id of ["danger", "success", "warning"]) {
    await expect(page.locator(`#${id}`)).not.toHaveCSS("background-color", "rgb(8, 108, 133)");
  }
  await expect(page.locator("#header-button")).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.locator("#header-button").hover();
  await expect(page.locator("#header-button")).toHaveCSS("color", "rgb(255, 255, 255)");
});

for (const width of [390, 768, 1280]) {
  test(`shared heading palette is legible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const headers = `<header class="ipd-map-header"><div class="ipd-map-heading"><span>+</span><div><small>Documentos de Pacientes</small><h2>Documentos</h2><p>Seleccione una visita.</p></div></div></header>
      <aside class="document-upload-context"><header class="ipd-context-header"><span class="ipd-context-avatar">P</span><div><small>Paciente seleccionado</small><h2>Paciente de prueba</h2><span>QA</span></div></header></aside>
      <button class="document-upload-visit-header"><span>Nueva visita</span><small>Desde hoy</small></button>`;
    await page.setContent(`<style>${styles}</style><div class="app-shell"><header class="topbar">HCSBA</header>
      <div class="clinical-dashboard-card"><header class="p-card-header">Clinico</header></div>
      <main class="page-container document-upload-page patient-documents-header-preview">${headers}</main>
      <main class="page-container document-upload-page radiology-control">${headers}</main></div>`);
    const clinical = await page.locator(".clinical-dashboard-card .p-card-header").evaluate((node) => getComputedStyle(node).backgroundImage);
    await expect(page.locator(".topbar")).toHaveCSS("background-image", clinical);
    for (const header of [".ipd-map-header", ".ipd-context-header", ".document-upload-visit-header"]) {
      const element = page.locator(`.patient-documents-header-preview ${header}`);
      await expect(element).toHaveCSS("background-image", clinical);
    }
    for (const text of await page.locator(".patient-documents-header-preview h2, .patient-documents-header-preview small, .patient-documents-header-preview p, .patient-documents-header-preview .ipd-context-avatar").all()) {
      await expect(text).toHaveCSS("color", "rgb(255, 255, 255)");
    }
    expect(await page.locator(".radiology-control .ipd-map-header").evaluate((node) => getComputedStyle(node).backgroundImage)).toBe(clinical);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("module and patient headings share the approved clinical palette", async ({ page }) => {
  const cases = [
    ["", "app-page-heading"], ["", "clinical-search-header"],
    ["", "appointments-heading"], ["", "admin-dashboard-hero"],
    ["", "audit-log-hero"], ["", "admin-beds-hero"],
    ["adt-page", "adt-patient-card-header"],
    ["clinical-visit-page", "clinical-visit-context-header"],
    ["ipd-page", "ipd-individual-patient-header"],
    ["clinical-dashboard-page", "patient-context-identity"],
    ["consultation-page", "patient-context-identity"],
    ["", "care-view-title"],
    ["", "appointment-admin-title"],
    ["", "appointment-subsection-title"],
    ["", "admin-section-title"],
  ];
  await page.setContent(`<style>${styles}</style><div class="app-shell">
    ${cases.map(([module, header], index) => `<main class="page-container ${module}"><header class="${header}" data-heading="${index}"><div><small>Contexto</small><h2>Titulo de prueba</h2><p>Informacion secundaria</p></div></header></main>`).join("")}
    <main class="page-container"><aside class="hcsba-patient-sidebar"><div class="patient-context-identity"><div><small>Paciente</small><h2>Identidad de prueba</h2></div></div></aside></main>
  </div>`);
  for (const heading of await page.locator("[data-heading], .hcsba-patient-sidebar .patient-context-identity").all()) {
    await expect(heading).toHaveCSS("background-image", "linear-gradient(110deg, rgb(7, 93, 115), rgb(8, 123, 150))");
    for (const text of await heading.locator("h2, p, small").all()) await expect(text).toHaveCSS("color", "rgb(255, 255, 255)");
  }
});

for (const width of [390, 620, 700, 768, 900, 1024, 1180, 1280, 1920]) {
  test(`cards use their available column width at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<style>${styles}</style><div class="app-shell">
      <main class="page-container clinical-dashboard-page">${columns}</main>
      <main class="page-container adt-page"><div class="adt-workspace"><aside class="panel adt-patient-card">Contexto de prueba</aside><div class="adt-main-column">${columns}</div></div></main>
      <main class="page-container"><div class="hcsba-patient-workspace"><aside class="panel hcsba-patient-sidebar">Contexto</aside><div class="hcsba-patient-content"><section class="panel">Formulario</section></div></div>
      <div class="program-card-grid"><article class="program-card">Programa corto</article><article class="program-card">Programa con un titulo mas largo</article></div>
      <div class="ipd-nursing-task-board"><article>Turno</article><article>Actividades pendientes</article></div></main>
    </div>`);
    for (const moduleSelector of [".clinical-dashboard-page", ".adt-page"]) {
      const stacked = width <= (moduleSelector === ".adt-page" ? 1180 : 900);
      const geometry = await page.locator(`${moduleSelector} .clinical-dashboard-item`).evaluateAll((items) => items.map((item) => {
        const container = item.closest(".clinical-dashboard-columns")!;
        const column = item.closest(".clinical-dashboard-column")!;
        const target = getComputedStyle(column).display === "contents" ? container : column;
        return { actual: item.getBoundingClientRect().width, expected: target.getBoundingClientRect().width,
          available: container.getBoundingClientRect().width };
      }));
      for (const item of geometry) {
        expect(Math.abs(item.actual - item.expected)).toBeLessThanOrEqual(1);
        if (stacked) expect(Math.abs(item.actual - item.available)).toBeLessThanOrEqual(1);
        else expect(item.actual).toBeLessThan(item.available * .6);
      }
    }
    if (width <= 900) {
      for (const selector of [".program-card-grid", ".ipd-nursing-task-board", ".hcsba-patient-content"]) {
        const bounds = await page.locator(selector).evaluate((node) => ({
          width: node.getBoundingClientRect().width,
          children: [...node.children].map((child) => child.getBoundingClientRect().width),
          padding: parseFloat(getComputedStyle(node).paddingLeft) + parseFloat(getComputedStyle(node).paddingRight),
        }));
        for (const child of bounds.children) expect(Math.abs(child - (bounds.width - bounds.padding))).toBeLessThanOrEqual(2);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
