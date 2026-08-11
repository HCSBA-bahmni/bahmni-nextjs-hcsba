export function resolveLegacyRoute(pathname: string, hash: string): string {
  const cleanHash = hash.replace(/^#\/?/, "");
  if (pathname.includes("/home/index.html")) {
    if (cleanHash.startsWith("login")) return "/login";
    if (cleanHash.startsWith("location")) return "/location";
    return "/home";
  }
  if (pathname.includes("/registration/index.html")) {
    const patient = cleanHash.match(/^patient\/([^/]+)(?:\/(visit))?/);
    if (patient?.[1] === "new") return "/registration/patient/new";
    if (patient?.[1]) return `/registration/patient/${patient[1]}${patient[2] ? "/visit" : ""}`;
    return "/registration";
  }
  if (pathname.includes("/clinical/index.html")) {
    const ipdDashboard = cleanHash.match(/^(?:[^/]+)\/patient\/([^/]+)\/dashboard\/visit\/ipd\/([^/?]+)(?:\?([^#]+))?/);
    if (ipdDashboard?.[1] && ipdDashboard[2]) {
      const query = ipdDashboard[3] ? `?${ipdDashboard[3]}` : "";
      return `/clinical/patient/${ipdDashboard[1]}/dashboard/visit/ipd/${ipdDashboard[2]}${query}`;
    }
    const consultation = cleanHash.match(/^([^/]+)\/patient\/([^/]+)\/(concept-set-group\/observations|diagnosis|disposition|consultation|orders|bacteriology|treatment)(?:\?([^#]+))?/);
    if (consultation?.[2] && consultation[3]) {
      const legacyBoard = consultation[3] ?? "concept-set-group/observations";
      const board = legacyBoard === "concept-set-group/observations" ? "observations" : legacyBoard === "consultation" ? "summary" : legacyBoard;
      const params = new URLSearchParams(consultation[4] ?? "");
      params.set("configName", consultation[1] ?? "default");
      const query = params.toString();
      return `/clinical/patient/${consultation[2]}/consultation/${board}${query ? `?${query}` : ""}`;
    }
    const visit = cleanHash.match(/^(?:[^/]+)\/patient\/([^/]+)\/dashboard\/visit\/([^/?]+)/);
    if (visit?.[1] && visit[2]) return `/clinical/patient/${visit[1]}/visit/${visit[2]}`;
    const patient = cleanHash.match(/^(?:[^/]+)\/patient\/([^/]+)\/dashboard/);
    if (patient?.[1]) return `/clinical/patient/${patient[1]}/dashboard`;
    return "/clinical";
  }
  if (pathname.includes("/bedmanagement/")) {
    const bed = cleanHash.match(/^bedManagement\/bed\/(\d+)/i);
    if (bed?.[1]) return `/bedmanagement/bed/${bed[1]}`;
    const patient = cleanHash.match(/^bedManagement\/patient\/([^/?]+)/i);
    if (patient?.[1]) return `/bedmanagement/patient/${patient[1]}`;
    const dashboard = cleanHash.match(/^patient\/([^/]+)\/visit\/([^/]+)\/dashboard/i);
    if (dashboard?.[1] && dashboard[2]) return `/bedmanagement/patient/${dashboard[1]}/visit/${dashboard[2]}/dashboard`;
    if (cleanHash.startsWith("home/careViewDashboard")) return "/bedmanagement/care-view";
    if (cleanHash.startsWith("bedManagement")) return "/bedmanagement/manage";
    return "/bedmanagement";
  }
  if (pathname.includes("/adt/")) {
    const patient = cleanHash.match(/^patient\/([^/]+)\/visit\/([^/?]+)/i);
    if (patient?.[1] && patient[2]) return `/adt/patient/${patient[1]}/visit/${patient[2]}`;
    return "/clinical";
  }
  return "/home";
}

export function isLegacyModuleUrl(url: string): boolean {
  return ["/adt/", "/document-upload/", "/orders/", "/reports/", "/appointments/", "/ot/"].some((part) => url.includes(part));
}

const SAFE_INTERNAL_PATH = /^\/(?!\/)[^\\]*$/;

export function sanitizeReturnUrl(value: string | string[] | undefined, fallback = "/home"): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !SAFE_INTERNAL_PATH.test(candidate)) return fallback;
  if (candidate.startsWith("/bahmni/")) return candidate.slice("/bahmni".length) || fallback;
  return candidate;
}

export interface LoginDestination {
  href: string;
  external: boolean;
}

export function resolveLoginDestination(value: string | string[] | undefined, whiteListedDomains: string[], origin: string): LoginDestination {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || SAFE_INTERNAL_PATH.test(candidate)) return { href: sanitizeReturnUrl(candidate), external: false };
  try {
    const absolute = new URL(candidate);
    const allowed = [origin, ...whiteListedDomains]
      .map((domain) => domain.trim().replace(/\/$/, ""))
      .filter(Boolean)
      .some((domain) => absolute.href === domain || absolute.href.startsWith(`${domain}/`));
    return allowed ? { href: absolute.href, external: true } : { href: "/home", external: false };
  } catch {
    return { href: "/home", external: false };
  }
}

export interface ResolvedExtensionUrl {
  href: string;
  kind: "next" | "legacy" | "service" | "external";
}

export function resolveExtensionUrl(rawUrl?: string): ResolvedExtensionUrl {
  if (!rawUrl) return { href: "/bahmni/home", kind: "next" };
  if (/^https?:\/\//i.test(rawUrl)) return { href: rawUrl, kind: "external" };

  const resolved = new URL(rawUrl, "https://hcsba.local/bahmni/home/");
  let href = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  if (/^\/bahmni\/registration(?:\/index\.html)?/i.test(resolved.pathname)) {
    const nextRoute = resolveLegacyRoute(resolved.pathname, resolved.hash);
    href = `/bahmni${nextRoute}${resolved.search}`;
    return { href, kind: "next" };
  }
  if (/^\/bahmni\/clinical(?:\/index\.html)?/i.test(resolved.pathname)) {
    const nextRoute = resolveLegacyRoute(resolved.pathname, resolved.hash);
    return { href: `/bahmni${nextRoute}${resolved.search}`, kind: "next" };
  }
  if (/^\/bahmni\/bedmanagement(?:\/index\.html)?/i.test(resolved.pathname)) {
    const nextRoute = resolveLegacyRoute(resolved.pathname, resolved.hash);
    return { href: `/bahmni${nextRoute}${resolved.search}`, kind: "next" };
  }
  if (/^\/bahmni\/adt(?:\/index\.html)?/i.test(resolved.pathname)) {
    const nextRoute = resolveLegacyRoute(resolved.pathname, resolved.hash);
    return { href: `/bahmni${nextRoute}${resolved.search}`, kind: "next" };
  }
  if (/^\/bahmni\/home(?:\/index\.html)?/i.test(resolved.pathname)) {
    return { href: "/bahmni/home", kind: "next" };
  }
  if (resolved.pathname.startsWith("/bahmni/")) return { href, kind: "legacy" };
  return { href, kind: "service" };
}

const iconMap: Record<string, string> = {
  "fa-user": "pi pi-user",
  "icon-bahmni-program": "pi pi-book",
  "fa-stethoscope": "pi pi-heart",
  "fa-bed": "pi pi-building",
  "icon-bahmni-radiology": "pi pi-images",
  "icon-bahmni-documents": "pi pi-file",
  "icon-bahmni-admin": "pi pi-cog",
  "icon-bahmni-orders": "pi pi-list",
  "icon-bahmni-reports": "pi pi-chart-bar",
  "fa-cog": "pi pi-cog",
  "fa-bar-chart": "pi pi-chart-bar",
  "fa-list-alt": "pi pi-list",
  "fa-hospital-o": "pi pi-building",
  "fa-pencil": "pi pi-pencil",
  "fa-pencil-square-o": "pi pi-pencil",
  "fa-terminal": "pi pi-desktop",
  "fa-calendar": "pi pi-calendar",
  "fa-flask": "pi pi-chart-line",
};

export function resolveLegacyIcon(icon?: string): string {
  if (!icon) return "pi pi-th-large";
  if (icon.startsWith("pi ")) return icon;
  const legacyClass = icon.trim().split(/\s+/).at(-1) ?? icon;
  return iconMap[legacyClass] ?? "pi pi-th-large";
}
