import type { JsonObject } from "@/config-compat/merge";

export interface ClinicalNavigationLink {
  name: string;
  label: string;
  href: string;
  internal: boolean;
  title?: string;
}

const standardLinks = [
  { name: "home", label: "Inicio", url: "/home", internal: true },
  { name: "visit", label: "Visita", url: "/clinical/patient/{{patientUuid}}/visit/{{visitUuid}}", internal: true },
  { name: "inpatient", label: "Hospitalización", url: "/adt/patient/{{patientUuid}}/visit/{{visitUuid}}", internal: true },
  { name: "enrolment", label: "Programas", url: "/bahmni/clinical/index.html#/programs/patient/{{patientUuid}}/consultationContext", internal: false },
  { name: "visitAttribute", label: "Atributos de visita", url: "/registration/patient/{{patientUuid}}/visit?visitUuid={{visitUuid}}", internal: true },
  { name: "registration", label: "Registro", url: "/registration/patient/{{patientUuid}}", internal: true },
] as const;

export function patientAdtUrl(patientUuid: string, visitUuid: string) {
  return `/adt/patient/${encodeURIComponent(patientUuid)}/visit/${encodeURIComponent(visitUuid)}`;
}

export function activeConsultationRoute(patientUuid: string, visitUuid?: string, enrollmentUuid?: string) {
  return {
    pathname: `/clinical/patient/${patientUuid}/consultation/observations`,
    query: {
      encounterUuid: "active",
      ...(visitUuid ? { visitUuid } : {}),
      configName: enrollmentUuid ? "programs" : "default",
      ...(enrollmentUuid ? { enrollment: enrollmentUuid } : {}),
    },
  };
}

function asCustomLinks(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const link = item as Record<string, unknown>;
    if (typeof link.url !== "string") return [];
    const isBedManagement = link.name === "bedManagement" || /bedmanagement\/#\/bedManagement\/patient/i.test(link.url);
    return [{
      name: typeof link.name === "string" ? link.name : `custom-${link.url}`,
      label: typeof link.title === "string" ? link.title : typeof link.translationKey === "string" ? link.translationKey : typeof link.name === "string" ? link.name : link.url,
      url: isBedManagement ? "/bedmanagement/patient/{{patientUuid}}?visitUuid={{visitUuid}}" : link.url,
      title: typeof link.title === "string" ? link.title : undefined,
      internal: isBedManagement || link.url.startsWith("/clinical/") || link.url.startsWith("/registration/") || link.url.startsWith("/adt/") || link.url === "/home",
    }];
  }) : [];
}

function formatUrl(template: string, params: Record<string, string | undefined>): string | undefined {
  const required = [...template.matchAll(/{{([^}]+)}}/g)].flatMap((match) => match[1] ? [match[1]] : []);
  if (required.some((key) => !params[key])) return undefined;
  return template.replace(/{{([^}]+)}}/g, (_match, key: string) => encodeURIComponent(params[key] ?? ""));
}

export function resolveClinicalNavigationLinks(config: JsonObject, patientUuid: string, visitUuid?: string): ClinicalNavigationLink[] {
  const requested = Array.isArray(config.showLinks) ? config.showLinks.filter((name): name is string => typeof name === "string") : undefined;
  if ((!requested || requested.length === 0) && !Array.isArray(config.customLinks)) return [];
  const selected = requested ? standardLinks.filter((link) => requested.includes(link.name)) : [];
  return [...selected, ...asCustomLinks(config.customLinks)].flatMap((link) => {
    const href = formatUrl(link.url, { patientUuid, visitUuid });
    return href ? [{ name: link.name, label: link.label, href, internal: link.internal, title: "title" in link ? link.title : undefined }] : [];
  });
}
