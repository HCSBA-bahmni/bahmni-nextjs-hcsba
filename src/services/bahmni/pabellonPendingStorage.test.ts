import { describe, expect, it, vi } from "vitest";
import { bahmniRequestWithResponse } from "./http";
import { getPendingPabellonReference, PabellonSubmission } from "./pabellonSubmission";
vi.mock("./http", async (original) => ({ ...await original<typeof import("./http")>(), bahmniRequestWithResponse: vi.fn() }));
const context = () => ({ actorUuid:crypto.randomUUID(), patientUuid:crypto.randomUUID(), visitUuid:crypto.randomUUID(), encounterUuid:"", sourceEnvironment:"pabellon43-dev" as const });
const key = (c: ReturnType<typeof context>) => `hcsba:pabellon:pending:v1:${c.sourceEnvironment}:${c.actorUuid}:${c.patientUuid}`;
describe("persistent technical recovery reference", () => {
  it("hydrates after reload and only verifies the original send without clinical data", async () => {
    const c=context(), sendId=crypto.randomUUID();
    localStorage.setItem(key(c),JSON.stringify({context:c,sendId}));
    const pending=getPendingPabellonReference(c)!;
    expect(pending).toEqual({context:c,sendId});
    vi.mocked(bahmniRequestWithResponse).mockResolvedValueOnce({status:200,headers:new Headers({"Cache-Control":"no-store"}),data:{sendId,correlationId:crypto.randomUUID(),result:{surgeryId:"7000000",requestNumber:"261106001",stateAtCreation:1}}});
    const session=new PabellonSubmission(pending.context,pending.sendId);
    await session.recover(c);
    const [path,options]=vi.mocked(bahmniRequestWithResponse).mock.calls.at(-1)!;
    expect(path).toContain("/requests/recover");
    expect(options!.body).not.toContain("clinical");
    expect(localStorage.getItem(key(c))).toBeNull();
    expect(getPendingPabellonReference(c)).toBeUndefined();
  });
  it("isolates actors, patients and source environments and rejects mismatched stored context", () => {
    const c=context(), sendId=crypto.randomUUID();
    localStorage.setItem(key(c),JSON.stringify({context:c,sendId}));
    expect(getPendingPabellonReference({...c,actorUuid:crypto.randomUUID()})).toBeUndefined();
    expect(getPendingPabellonReference({...c,patientUuid:crypto.randomUUID()})).toBeUndefined();
    expect(getPendingPabellonReference({...c,sourceEnvironment:"qa-isolated"})).toBeUndefined();
    const other=context();
    localStorage.setItem(key(other),JSON.stringify({context:c,sendId}));
    expect(getPendingPabellonReference(other)).toBeUndefined();
  });
  it("keeps the reference when verification fails", async () => {
    const c=context(), sendId=crypto.randomUUID();
    localStorage.setItem(key(c),JSON.stringify({context:c,sendId}));
    vi.mocked(bahmniRequestWithResponse).mockRejectedValueOnce(new Error("network"));
    await expect(new PabellonSubmission(c,sendId).recover(c)).rejects.toMatchObject({recoveryRequired:true});
    expect(JSON.parse(localStorage.getItem(key(c))!)).toEqual({context:c,sendId});
  });
});
