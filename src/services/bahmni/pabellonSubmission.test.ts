import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bahmniRequestWithResponse, BahmniApiError } from "./http";
import { PabellonSubmission, PabellonSubmissionError, getPendingPabellonReference, type PabellonSubmissionContext, type PabellonSubmissionInput } from "./pabellonSubmission";
vi.mock("./http", async (original) => ({ ...await original<typeof import("./http")>(), bahmniRequestWithResponse: vi.fn() }));
const context = (): PabellonSubmissionContext => ({ actorUuid: crypto.randomUUID(), patientUuid: crypto.randomUUID(), visitUuid: crypto.randomUUID(), encounterUuid: "" });
const input = (): PabellonSubmissionInput => ({ patientDetails: { telephone: "900000000", address: "QA", addressNumber: "1", communeId: 13101, communeName: "QA COMUNA", insuranceCode: 0, insuranceName: "DESCONOCIDO", insuranceSegment: "" }, clinical: { diagnostico: "QA", nombre_cirujano: "QA MEDICO" } });
function response(sendId: string, status = 201) { return { status, headers: new Headers({ "Cache-Control": "no-store" }), data: { sendId, correlationId: crypto.randomUUID(), result: { surgeryId: "7000000", requestNumber: "261103001", stateAtCreation: 1 } } }; }
const failure = (sendId: string, code: string, recoveryRequired: boolean) => ({ code, message: "PRIVATE REMOTE ERROR MUST NOT APPEAR", correlationId: crypto.randomUUID(), retryable: false, sendId, recoveryRequired });
describe("HIS logical submission", () => {
  it("isolates pending QA and DEV references without sending environment metadata", async () => {
    const qa = context(); const dev = { ...qa, sourceEnvironment: "pabellon43-dev" as const };
    const first = new PabellonSubmission(qa); const second = new PabellonSubmission(dev);
    vi.mocked(bahmniRequestWithResponse).mockRejectedValue(new Error("NETWORK"));
    await expect(first.submit(qa, input())).rejects.toMatchObject({ recoveryRequired: true });
    expect(getPendingPabellonReference(dev)).toBeUndefined();
    await expect(second.submit(dev, input())).rejects.toMatchObject({ recoveryRequired: true });
    expect(getPendingPabellonReference(qa)?.sendId).toBe(first.sendId);
    expect(getPendingPabellonReference(dev)?.sendId).toBe(second.sendId);
    expect(bahmniRequestWithResponse).toHaveBeenCalledTimes(2);
    for (const [, options] of vi.mocked(bahmniRequestWithResponse).mock.calls) expect(JSON.parse(options!.body as string)).not.toHaveProperty("sourceEnvironment");
    await expect(first.recover(dev)).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
    await expect(second.recover(qa)).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
    expect(bahmniRequestWithResponse).toHaveBeenCalledTimes(2);
  });
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.useRealTimers());
  it("posts exactly once for concurrent clicks, freezes input and reuses confirmed result", async () => {
    const c = context(); const session = new PabellonSubmission(c); const body = input();
    let resolve!: (value: ReturnType<typeof response>) => void;
    vi.mocked(bahmniRequestWithResponse).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const first = session.submit(c, body); const second = session.submit(c, body);
    expect(second).toBe(first); expect(session.phase).toBe("submitting");
    body.clinical.diagnostico = "CHANGED";
    const [path, options] = vi.mocked(bahmniRequestWithResponse).mock.calls[0]!;
    expect(path).toBe("/pabellon-gateway/v1/patients/" + c.patientUuid + "/requests");
    const sent = JSON.parse(options!.body as string);
    expect(sent.clinical.diagnostico).toBe("QA");
    expect(Object.keys(sent).sort()).toEqual(["sendId", "visitUuid", "encounterUuid", "clinical", "patientDetails"].sort());
    resolve(response(session.sendId)); const receipt = await first;
    expect(session.phase).toBe("confirmed");
    expect(await session.submit(c, input())).toBe(receipt);
    expect(bahmniRequestWithResponse).toHaveBeenCalledTimes(1);
    expect(getPendingPabellonReference(c)).toBeUndefined();
  });
  it.each(["actorUuid", "patientUuid", "visitUuid", "encounterUuid"] as const)("rejects changed %s before any request", async (key) => {
    const c = context(); const session = new PabellonSubmission(c);
    await expect(session.submit({ ...c, [key]: crypto.randomUUID() }, input())).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it.each(["photo", "status", "oversized", "extra-detail"] as const)("rejects unsafe %s locally", async (mode) => {
    const c = context(); const session = new PabellonSubmission(c); const value = input();
    if (mode === "photo") Object.assign(value.clinical, { data_paciente: "NOT ALLOWED" });
    if (mode === "status") value.clinical.estado_cirugia_id = 3;
    if (mode === "oversized") value.clinical.diagnostico = "A".repeat(9000);
    if (mode === "extra-detail") Object.assign(value.patientDetails, { rut: "NOT ALLOWED" });
    await expect(session.submit(c, value)).rejects.toMatchObject({ code: "CREATION_INPUT_INVALID", recoveryRequired: false });
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("locks uncertain sends and recovers the same reference using no clinical payload", async () => {
    const c = context(); const session = new PabellonSubmission(c);
    vi.mocked(bahmniRequestWithResponse).mockRejectedValueOnce(new Error("PRIVATE"));
    await expect(session.submit(c, input())).rejects.toMatchObject({ recoveryRequired: true });
    expect(session.phase).toBe("recovery-required");
    expect(getPendingPabellonReference(c)?.sendId).toBe(session.sendId);
    expect(getPendingPabellonReference({ ...c, actorUuid: crypto.randomUUID() })).toBeUndefined();
    await expect(session.submit(c, input())).rejects.toMatchObject({ recoveryRequired: true });
    expect(bahmniRequestWithResponse).toHaveBeenCalledTimes(1);
    vi.mocked(bahmniRequestWithResponse).mockResolvedValueOnce(response(session.sendId, 200));
    await session.recover(c);
    const [path, options] = vi.mocked(bahmniRequestWithResponse).mock.calls[1]!;
    expect(path).toMatch(/\/requests\/recover$/);
    expect(JSON.parse(options!.body as string)).toEqual({ sendId: session.sendId, visitUuid: c.visitUuid, encounterUuid: "" });
    expect(session.phase).toBe("confirmed");
  });
  it("blocks a second instance/key for the same actor/patient while the first is uncertain", async () => {
    const c = context(); const first = new PabellonSubmission(c); const second = new PabellonSubmission(c);
    vi.mocked(bahmniRequestWithResponse).mockRejectedValue(new Error("NETWORK"));
    await expect(first.submit(c, input())).rejects.toBeInstanceOf(PabellonSubmissionError);
    await expect(second.submit(c, input())).rejects.toMatchObject({ code: "PENDING_SEND_EXISTS" });
    expect(bahmniRequestWithResponse).toHaveBeenCalledTimes(1);
    const restored = new PabellonSubmission(c, first.sendId);
    vi.mocked(bahmniRequestWithResponse).mockResolvedValueOnce(response(first.sendId, 200));
    await restored.recover(c); expect(getPendingPabellonReference(c)).toBeUndefined();
  });
  it("unlocks only an exact authoritative validation rejection and keeps its send ID", async () => {
    const c = context(); const session = new PabellonSubmission(c); const id = session.sendId;
    vi.mocked(bahmniRequestWithResponse).mockRejectedValueOnce(new BahmniApiError(422, "PRIVATE", failure(id, "CREATION_INPUT_INVALID", false)));
    await expect(session.submit(c, input())).rejects.toMatchObject({ recoveryRequired: false });
    expect(session.error?.message).not.toContain("PRIVATE");
    expect(session.phase).toBe("editable"); expect(getPendingPabellonReference(c)).toBeUndefined();
    vi.mocked(bahmniRequestWithResponse).mockResolvedValueOnce(response(id));
    await session.submit(c, input()); expect(session.sendId).toBe(id);
  });
  it.each(["wrong-id", "wrong-state", "extra", "status", "cache"] as const)("treats invalid %s success as unknown, not editable", async (mode) => {
    const c = context(); const session = new PabellonSubmission(c); const reply = response(session.sendId);
    if (mode === "wrong-id") reply.data.sendId = crypto.randomUUID();
    if (mode === "wrong-state") reply.data.result.stateAtCreation = 3;
    if (mode === "extra") Object.assign(reply.data, { clinical: "NOT ALLOWED" });
    if (mode === "status") reply.status = 200;
    if (mode === "cache") reply.headers.delete("Cache-Control");
    vi.mocked(bahmniRequestWithResponse).mockResolvedValue(reply);
    await expect(session.submit(c, input())).rejects.toMatchObject({ code: "SUBMISSION_OUTCOME_UNKNOWN", recoveryRequired: true });
    expect(session.phase).toBe("recovery-required"); expect(session.receipt).toBeUndefined();
  });
  it("keeps 404 unconfirmed recovery locked and never enables another submit", async () => {
    const c = context(); const id = crypto.randomUUID(); const session = new PabellonSubmission(c, id);
    vi.mocked(bahmniRequestWithResponse).mockRejectedValue(new BahmniApiError(404, "PRIVATE", failure(id, "SEND_NOT_CONFIRMED", true)));
    await expect(session.recover(c)).rejects.toMatchObject({ code: "SEND_NOT_CONFIRMED" });
    expect(session.phase).toBe("recovery-required");
    await expect(session.submit(c, input())).rejects.toMatchObject({ recoveryRequired: true });
    expect(bahmniRequestWithResponse).toHaveBeenCalledTimes(1);
  });
  it("ends timeout loading as an uncertain outcome, with no automatic retry", async () => {
    vi.useFakeTimers(); const c = context(); const session = new PabellonSubmission(c);
    vi.mocked(bahmniRequestWithResponse).mockImplementation((_path, options) => new Promise((_done, fail) => {
      options?.signal?.addEventListener("abort", () => fail(new DOMException("Aborted", "AbortError")));
    }));
    const result = session.submit(c, input()); const check = expect(result).rejects.toMatchObject({ recoveryRequired: true });
    await vi.advanceTimersByTimeAsync(45000); await check;
    expect(session.phase).toBe("recovery-required"); expect(bahmniRequestWithResponse).toHaveBeenCalledTimes(1);
  });
});
