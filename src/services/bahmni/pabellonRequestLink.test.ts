import { beforeEach, describe, expect, it, vi } from "vitest";
import { bahmniRequest } from "./http";
import { requestPabellonLink, type RequestLinkCommand } from "./pabellonRequestLink";
vi.mock("./http", () => ({ bahmniRequest: vi.fn() }));
const patient="11111111-1111-4111-8111-111111111111",visit="22222222-2222-4222-8222-222222222222";
const preview: RequestLinkCommand={action:"preview",requestNumber:"261105001",visitUuid:"",encounterUuid:"",expectedVersion:0};
const response={surgeryId:"12",requestNumber:preview.requestNumber,visitUuid:visit,encounterUuid:"",version:1,active:true};
beforeEach(()=>vi.resetAllMocks());
describe("contrato de vinculación de solicitud",()=>{
 it("conserva el comando nativo sin reintentar y valida el número leído",async()=>{
  vi.mocked(bahmniRequest).mockResolvedValue(response);
  await expect(requestPabellonLink(patient,preview)).resolves.toEqual(response);
  expect(bahmniRequest).toHaveBeenCalledTimes(1);
  expect(vi.mocked(bahmniRequest).mock.calls[0]![1]).toMatchObject({method:"POST",body:JSON.stringify(preview),cache:"no-store"});
 });
 it.each(["number","visit","active"])("rechaza respuesta de otro contexto: %s",async(kind)=>{
  const command:RequestLinkCommand={...preview,action:"link",visitUuid:visit};
  vi.mocked(bahmniRequest).mockResolvedValue({...response,...(kind==="number"?{requestNumber:"261105002"}:kind==="visit"?{visitUuid:patient}:{active:false})});
  await expect(requestPabellonLink(patient,command)).rejects.toThrow("No se pudo confirmar");
  expect(bahmniRequest).toHaveBeenCalledTimes(1);
 });
 it("no confirma una desvinculación cuya respuesta sigue activa",async()=>{
  vi.mocked(bahmniRequest).mockResolvedValue(response);
  await expect(requestPabellonLink(patient,{...preview,action:"unlink",expectedVersion:1})).rejects.toThrow("No se pudo confirmar");
 });
 it("rechaza una atención inválida antes de escribir",async()=>{
  await expect(requestPabellonLink(patient,{...preview,action:"link"})).rejects.toThrow("Revise");
  expect(bahmniRequest).not.toHaveBeenCalled();
 });
});
