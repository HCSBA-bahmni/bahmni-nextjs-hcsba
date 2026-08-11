import { z, type ZodType } from "zod";

export class BahmniApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly payload?: unknown) {
    super(message);
    this.name = "BahmniApiError";
  }
}

const errorPayloadSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    code: z.string().optional(),
  }).loose().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
}).loose();

export interface BahmniErrorTechnicalDetails {
  status?: number;
  code?: string;
  exceptionType?: string;
  origin?: string;
}

function safeStackLocation(detail: string | undefined): Pick<BahmniErrorTechnicalDetails, "exceptionType" | "origin"> {
  if (!detail) return {};
  const exceptions = [...detail.matchAll(/(?:^|\n)(?:Caused by:\s*)?([A-Za-z_$][\w.$]*(?:Exception|Error))(?::[^\r\n]*)?/g)];
  const root = exceptions.at(-1);
  if (!root) return {};
  const remaining = detail.slice((root.index ?? 0) + root[0].length);
  const frame = remaining.match(/(?:^|\n)\s*at\s+([A-Za-z_$][\w.$]*\([^\r\n)]+\))/);
  return {
    exceptionType: root[1],
    ...(frame?.[1] ? { origin: frame[1] } : {}),
  };
}

/**
 * Returns only non-clinical diagnostics that are safe to render in the UI.
 * The OpenMRS `detail` field is intentionally excluded because it can contain
 * request values and a complete server stack trace.
 */
export function getBahmniErrorTechnicalDetails(error: unknown): BahmniErrorTechnicalDetails {
  if (!(error instanceof BahmniApiError)) return {};
  const parsed = errorPayloadSchema.safeParse(error.payload);
  const code = parsed.success ? parsed.data.error?.code ?? parsed.data.code : undefined;
  const stack = parsed.success && parsed.data.error && "detail" in parsed.data.error && typeof parsed.data.error.detail === "string"
    ? safeStackLocation(parsed.data.error.detail)
    : {};
  return { status: error.status, ...(code ? { code } : {}), ...stack };
}

export const openmrsBase = process.env.NEXT_PUBLIC_OPENMRS_BASE ?? "/openmrs";

export interface BahmniResponse<T> {
  data: T;
  status: number;
}

export async function bahmniRequestWithResponse<T>(
  path: string,
  options: RequestInit & { schema?: ZodType<T>; skipUnauthorizedEvent?: boolean } = {},
): Promise<BahmniResponse<T>> {
  const { schema, skipUnauthorizedEvent = false, ...requestOptions } = options;
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  headers.set("Disable-WWW-Authenticate", "true");
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path.startsWith("http") ? path : `${openmrsBase}${path}`, {
    ...requestOptions, headers, credentials: "include",
  });
  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown;
  if (response.status === 204) payload = undefined;
  else {
    const responseText = await response.text();
    if (contentType.includes("json") && responseText) {
      try { payload = JSON.parse(responseText) as unknown; }
      catch { payload = responseText; }
    } else payload = responseText;
  }
  if (!response.ok) {
    if (response.status === 401 && !skipUnauthorizedEvent && typeof window !== "undefined") window.dispatchEvent(new Event("bahmni:unauthorized"));
    const detail = errorPayloadSchema.safeParse(payload);
    throw new BahmniApiError(response.status, detail.success ? detail.data.error?.message ?? detail.data.message ?? response.statusText : response.statusText, payload);
  }
  return {
    data: schema ? schema.parse(payload) : payload as T,
    status: response.status,
  };
}

export async function bahmniRequest<T>(
  path: string,
  options: RequestInit & { schema?: ZodType<T>; skipUnauthorizedEvent?: boolean } = {},
): Promise<T> {
  return (await bahmniRequestWithResponse(path, options)).data;
}

export function basicAuthorization(username: string, password: string, otp?: string): string {
  const credential = otp ? `${username}:${password}:${otp}` : `${username}:${password}`;
  const bytes = new TextEncoder().encode(credential);
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return `Basic ${btoa(binary)}`;
}

export function queryString(values: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== "") params.set(key, String(value)); });
  const query = params.toString();
  return query ? `?${query}` : "";
}
