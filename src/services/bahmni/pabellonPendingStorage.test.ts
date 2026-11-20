import { describe, expect, it, vi } from "vitest";
import { bahmniRequestWithResponse } from "./http";
import { getPendingPabellonReference, PabellonSubmission } from "./pabellonSubmission";
vi.mock("./http", async (original) => ({ ...await original<typeof import("./http")>(), bahmniRequestWithResponse: vi.fn() }));
const context = () => ({ actorUuid:crypto.randomUUID(), patientUuid:crypto.randomUUID(), visitUuid:crypto.randomUUID(), encounterUuid:"", sourceEnvironment:"pabellon43-dev" as const });
const key = (c: ReturnType<typeof context>) => `hcsba:pabellon:pending:v1:${c.sourceEnvironment}:${c.actorUuid}:${c.patientUuid}`;
describe("persistent technical recovery reference", () => {
  it("does not overwrite corrupt storage or issue a new POST", async () => {
    const c=context(); localStorage.setItem(key(c),"invalid-json");
    const requestCount=vi.mocked(bahmniRequestWithResponse).mock.calls.length;
    await expect(new PabellonSubmission(c).submit(c,{patientDetails:{telephone:"900000000",address:"QA",addressNumber:"1",communeId:1,communeName:"QA",insuranceCode:0,insuranceName:"QA",insuranceSegment:""},clinical:{diagnostico:"QA"}})).rejects.toMatchObject({code:"PENDING_REFERENCE_UNAVAILABLE"});
    expect(localStorage.getItem(key(c))).toBe("invalid-json");
    expect(vi.mocked(bahmniRequestWithResponse).mock.calls.length).toBe(requestCount);
  });
  it("reads the reference replaced by another tab instead of keeping stale memory", () => {
    const c=context(), first=crypto.randomUUID(), second=crypto.randomUUID();
    localStorage.setItem(key(c),JSON.stringify({context:c,sendId:first}));
    expect(getPendingPabellonReference(c)?.sendId).toBe(first);
    localStorage.setItem(key(c),JSON.stringify({context:c,sendId:second}));
    expect(getPendingPabellonReference(c)?.sendId).toBe(second);
    localStorage.removeItem(key(c));
    expect(getPendingPabellonReference(c)).toBeUndefined();
  });
  it("does not remove another tab's pending reference when an older recovery confirms", async () => {
    const c=context(), first=crypto.randomUUID(), second=crypto.randomUUID();
    localStorage.setItem(key(c),JSON.stringify({context:c,sendId:first}));
    let finish!: (value: Awaited<ReturnType<typeof bahmniRequestWithResponse>>) => void;
    vi.mocked(bahmniRequestWithResponse).mockImplementationOnce(() => new Promise(resolve => { finish=resolve; }));
    const work=new PabellonSubmission(c,first).recover(c);
    localStorage.setItem(key(c),JSON.stringify({context:c,sendId:second}));
    finish({status:200,headers:new Headers({"Cache-Control":"no-store"}),data:{sendId:first,correlationId:crypto.randomUUID(),result:{surgeryId:"7000000",requestNumber:"261106001",stateAtCreation:1}}});
    await work;
    expect(getPendingPabellonReference(c)?.sendId).toBe(second);
    expect(JSON.parse(localStorage.getItem(key(c))!).sendId).toBe(second);
  });
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
