import { decode as decodeCbor } from "cbor-x";
import { inflate } from "pako";

const base45Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const base45Values = new Map([...base45Alphabet].map((character, index) => [character, index]));

export interface IcvpPreview {
  kind: "HC1";
  hcert?: Record<string, unknown>;
  issuedAt?: number;
  expiresAt?: number;
  issuer?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Map || value instanceof Uint8Array) return undefined;
  return value as Record<string, unknown>;
}

function unwrapTagged(value: unknown): unknown {
  const source = record(value);
  return source && "tag" in source && "value" in source ? source.value : value;
}

function claim(container: unknown, key: number): unknown {
  const value = unwrapTagged(container);
  if (value instanceof Map) return value.get(key) ?? value.get(String(key));
  const source = record(value);
  return source?.[String(key)];
}

function jsonRecord(value: unknown): Record<string, unknown> | undefined {
  const normalized = jsonFriendly(unwrapTagged(value));
  return record(normalized);
}

function jsonFriendly(value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([key, child]) => [String(key), jsonFriendly(child)]));
  if (value instanceof Uint8Array) return undefined;
  if (Array.isArray(value)) return value.map(jsonFriendly);
  const source = record(value);
  if (source) return Object.fromEntries(Object.entries(source).map(([key, child]) => [key, jsonFriendly(child)]));
  return value;
}

function bytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value && typeof value === "object" && "length" in value && typeof value.length === "number") {
    const candidate = Array.from(value as ArrayLike<unknown>);
    if (candidate.every((item) => typeof item === "number" && item >= 0 && item <= 255)) return Uint8Array.from(candidate as number[]);
  }
  return undefined;
}

export function normalizeHc1(value: string): string {
  const compact = value.trim().replace(/[\r\n\t]+/g, "");
  if (!compact) return "";
  if (/^HC1:/i.test(compact)) return `HC1:${compact.replace(/^HC1:\s*/i, "")}`;
  return /^[0-9A-Z $%*+\-./:]{26,}$/i.test(compact) ? `HC1:${compact}` : compact;
}

export function decodeBase45(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length;) {
    const remaining = value.length - index;
    if (remaining === 1) throw new Error("Base45 inválido: longitud incompleta");
    const first = base45Values.get(value[index++]!);
    const second = base45Values.get(value[index++]!);
    if (first === undefined || second === undefined) throw new Error("Base45 inválido: carácter no permitido");
    if (remaining >= 3) {
      const third = base45Values.get(value[index++]!);
      if (third === undefined) throw new Error("Base45 inválido: carácter no permitido");
      const decoded = first + second * 45 + third * 45 * 45;
      if (decoded > 0xffff) throw new Error("Base45 inválido: desbordamiento");
      bytes.push(decoded >> 8, decoded & 0xff);
    } else {
      const decoded = first + second * 45;
      if (decoded > 0xff) throw new Error("Base45 inválido: desbordamiento");
      bytes.push(decoded);
    }
  }
  return new Uint8Array(bytes);
}

export function decodeIcvpPreview(value: string): IcvpPreview {
  const normalized = normalizeHc1(value);
  if (!/^HC1:/i.test(normalized)) throw new Error("El contenido no comienza con HC1:");
  const coseBytes = inflate(decodeBase45(normalized.slice(4)));
  const cose = unwrapTagged(decodeCbor(coseBytes));
  if (!Array.isArray(cose) || cose.length < 4) throw new Error("El código no contiene un COSE_Sign1 válido");
  const payload = bytes(cose[2]);
  if (!payload) throw new Error("El COSE_Sign1 no contiene un payload válido");
  const cwt = unwrapTagged(decodeCbor(payload));
  const hcertContainer = claim(cwt, -260);
  const hcert = jsonRecord(claim(hcertContainer, 1) ?? claim(hcertContainer, -6));
  const issuedAt = claim(cwt, 6);
  const expiresAt = claim(cwt, 4);
  const issuer = claim(cwt, 1);
  return {
    kind: "HC1",
    hcert,
    issuedAt: typeof issuedAt === "number" ? issuedAt : undefined,
    expiresAt: typeof expiresAt === "number" ? expiresAt : undefined,
    issuer: typeof issuer === "string" ? issuer : undefined,
  };
}

export function icvpVaccinations(preview: IcvpPreview): Record<string, unknown>[] {
  const value = preview.hcert?.v;
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(record(item)));
  const single = record(value);
  return single ? [single] : [];
}
