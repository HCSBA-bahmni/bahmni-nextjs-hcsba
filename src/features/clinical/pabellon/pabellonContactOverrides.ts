import type { PabellonContactDraft } from "./pabellonContactDraft";

/** Only request-local corrections, never a write-back to the HIS registry. */
export type PabellonContactOverrides = Partial<PabellonContactDraft>;
export function mergePabellonContact(base: PabellonContactDraft, overrides: PabellonContactOverrides): PabellonContactDraft {
  const draft = { ...base, ...overrides };
  if (draft.insurance?.code !== "1") draft.insuranceSegment = "";
  return draft;
}
export function patchPabellonContact(base: PabellonContactDraft, overrides: PabellonContactOverrides, patch: Partial<PabellonContactDraft>): PabellonContactOverrides {
  const current = mergePabellonContact(base, overrides);
  const next = { ...overrides, ...patch };
  if (Object.hasOwn(patch, "insurance")) {
    const same = patch.insurance?.system === current.insurance?.system && patch.insurance?.sourceId === current.insurance?.sourceId && patch.insurance?.code === current.insurance?.code;
    next.insuranceSegment = same && patch.insurance?.code === "1" ? current.insuranceSegment : "";
  }
  if (Object.hasOwn(patch, "insuranceSegment")) {
    // Keep the chosen segment bound to its insurer across a registry refresh.
    next.insurance = Object.hasOwn(patch, "insurance") ? patch.insurance : current.insurance;
    next.insuranceSegment = next.insurance?.code === "1" ? patch.insuranceSegment! : "";
  }
  return next;
}
