import { z } from "zod";

const attachmentSchema = z.object({ contentType: z.string().optional(), url: z.string().optional(), title: z.string().optional(), creation: z.string().optional(), data: z.string().optional() }).passthrough();
const documentReferenceSchema = z.object({
  resourceType: z.literal("DocumentReference"), id: z.string().optional(), status: z.string().optional(), date: z.string().optional(), indexed: z.string().optional(),
  type: z.object({ coding: z.array(z.object({ display: z.string().optional(), code: z.string().optional() }).passthrough()).optional(), text: z.string().optional() }).passthrough().optional(),
  author: z.array(z.object({ display: z.string().optional() }).passthrough()).optional(),
  content: z.array(z.object({ attachment: attachmentSchema, format: z.object({ code: z.string().optional() }).passthrough().optional() }).passthrough()).default([]),
  meta: z.object({ lastUpdated: z.string().optional(), profile: z.array(z.string()).optional() }).passthrough().optional(),
}).passthrough();
const bundleSchema = z.object({
  resourceType: z.literal("Bundle"), id: z.string().optional(), type: z.string().optional(), timestamp: z.string().optional(),
  meta: z.object({ profile: z.array(z.string()).optional() }).passthrough().optional(),
  entry: z.array(z.object({ fullUrl: z.string().optional(), resource: z.record(z.string(), z.unknown()).optional() }).passthrough()).default([]),
  link: z.array(z.object({ relation: z.string().optional(), url: z.string().optional() }).passthrough()).default([]),
}).passthrough();
const resolvedManifestSchema = z.object({ files: z.array(z.object({ location: z.string(), contentType: z.string().optional() }).passthrough()).default([]) }).passthrough();
const vhlSchema = z.union([z.object({ hc1: z.string() }).passthrough(), z.string()]);
const icvpSchema = z.object({ results: z.array(z.object({ immunizationId: z.string().optional(), ok: z.boolean().optional(), status: z.union([z.string(), z.number()]).optional(), data: z.record(z.string(), z.unknown()).optional() }).passthrough()).default([]) }).passthrough();

export type IpsDocumentReference = z.infer<typeof documentReferenceSchema>;
export type FhirBundle = z.infer<typeof bundleSchema>;
export type IpsResolvedFile = z.infer<typeof resolvedManifestSchema>["files"][number];

function sameOriginPath(path: string): string {
  if (typeof window === "undefined") throw new Error("IPS sólo está disponible en el navegador");
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error("El mediador IPS debe publicarse bajo el mismo origen");
  return `${url.pathname}${url.search}${url.hash}`;
}

const joinPath = (base: string, path: string) => `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(sameOriginPath(url), { ...init, credentials: "include", headers: { Accept: "application/fhir+json, application/json;q=0.9", ...init?.headers } });
  if (!response.ok) throw new Error(`IPS ${response.status}`);
  return response.json();
}

export async function searchIpsDocuments(regionalBase: string, identifier: string): Promise<IpsDocumentReference[]> {
  const normalized = identifier.trim().replace(/^RUN\*/i, "");
  if (!normalized) return [];
  let best: IpsDocumentReference[] = [];
  let previousCount = -1;
  for (let count = 50; count <= 2000; count += 50) {
    const query = new URLSearchParams({ "patient.identifier": normalized, _count: String(count) });
    const bundle = bundleSchema.parse(await requestJson(`${joinPath(regionalBase, "DocumentReference")}?${query}`));
    const documents = bundle.entry.flatMap((entry) => { const result = documentReferenceSchema.safeParse(entry.resource); return result.success ? [result.data] : []; });
    if (documents.length > best.length) best = documents;
    const hasNext = bundle.link.some((link) => link.relation?.toLowerCase() === "next");
    if (!hasNext || documents.length <= previousCount) break;
    previousCount = documents.length;
  }
  return best.sort((left, right) => ipsDocumentTimestamp(right) - ipsDocumentTimestamp(left));
}

export function ipsDocumentTimestamp(document: IpsDocumentReference): number {
  const value = document.date ?? document.indexed ?? document.content[0]?.attachment.creation ?? document.meta?.lastUpdated;
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function ipsDocumentTitle(document: IpsDocumentReference): string {
  return document.type?.text ?? document.type?.coding?.[0]?.display ?? document.content[0]?.attachment.title ?? "Documento clínico";
}

export function resolveIpsAttachment(regionalBase: string, attachmentUrl: string): string {
  const raw = attachmentUrl.trim();
  if (!raw) throw new Error("El documento no contiene una ubicación");
  if (!/^https?:\/\//i.test(raw)) return sameOriginPath(joinPath(regionalBase, raw.replace(/^\/regional\//i, "")));
  const absolute = new URL(raw);
  if (typeof window !== "undefined" && absolute.origin === window.location.origin) return sameOriginPath(raw);
  const marker = "/regional/";
  const index = absolute.pathname.toLowerCase().indexOf(marker);
  if (index < 0) throw new Error("El adjunto IPS apunta a un origen no permitido");
  return sameOriginPath(joinPath(regionalBase, absolute.pathname.slice(index + marker.length)));
}

export async function loadIpsBundle(regionalBase: string, attachmentUrl: string): Promise<FhirBundle> {
  return bundleSchema.parse(await requestJson(resolveIpsAttachment(regionalBase, attachmentUrl)));
}

export async function loadIpsBinary(regionalBase: string, attachmentUrl: string): Promise<Blob> {
  const response = await fetch(resolveIpsAttachment(regionalBase, attachmentUrl), { credentials: "include", headers: { Accept: "*/*" } });
  if (!response.ok) throw new Error(`IPS ${response.status}`);
  return response.blob();
}

export async function generateVhl(path: string, bundle: FhirBundle): Promise<string> {
  const data = vhlSchema.parse(await requestJson(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bundle) }));
  return typeof data === "string" ? data.trim() : data.hc1.trim();
}

export async function resolveVhl(path: string, hc1: string): Promise<IpsResolvedFile[]> {
  const normalized = hc1.replace(/[\r\n\t]+/g, "").trim();
  if (!/^HC1:/i.test(normalized)) throw new Error("El contenido debe comenzar con HC1:");
  const data = resolvedManifestSchema.parse(await requestJson(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qrCodeContent: normalized }) }));
  return data.files;
}

export async function generateIcvp(path: string, bundle: FhirBundle) {
  return icvpSchema.parse(await requestJson(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bundle) })).results;
}

export function icvpArtifacts(result: z.infer<typeof icvpSchema>["results"][number]): { hc1?: string; pngDataUrl?: string } {
  const entries = Array.isArray(result.data?.entry) ? result.data.entry : [];
  const document = entries.find((entry) => entry && typeof entry === "object" && "resource" in entry && (entry as { resource?: { resourceType?: string } }).resource?.resourceType === "DocumentReference") as { resource?: { content?: Array<{ attachment?: { contentType?: string; data?: string }; format?: { code?: string } }> } } | undefined;
  let hc1: string | undefined;
  let pngDataUrl: string | undefined;
  for (const content of document?.resource?.content ?? []) {
    const encoded = content.attachment?.data;
    if (!encoded) continue;
    if (content.attachment?.contentType === "image/png" || content.format?.code === "image") pngDataUrl = `data:image/png;base64,${encoded}`;
    if (content.attachment?.contentType === "text/plain" || content.format?.code === "hc1") { try { hc1 = atob(encoded); } catch { hc1 = encoded; } }
  }
  return { hc1, pngDataUrl };
}
