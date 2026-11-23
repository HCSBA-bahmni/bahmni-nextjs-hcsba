import { beforeEach,describe,expect,it,vi } from "vitest";
import { loadPabellonSmallCatalogue } from "./pabellonSmallCatalogue";
import { getPabellonCatalogue,type PabellonCataloguePage } from "@/services/bahmni/pabellonCatalogues";
vi.mock("@/services/bahmni/pabellonCatalogues",async original=>({...await original<typeof import("@/services/bahmni/pabellonCatalogues")>(),getPabellonCatalogue:vi.fn()}));
const page=(id:string,nextCursor:string|null=null):PabellonCataloguePage=>({catalogue:"communes",version:"a".repeat(64),items:[{sourceId:id,code:id,display:"QA",system:"urn:hcsba:personas:catalogue:communes",active:true,relations:[]}],nextCursor,observedAt:"2026-11-03T10:00:00Z",correlationId:crypto.randomUUID()});
describe("Bounded small source catalogues",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("checks every page and preserves original codes",async()=>{
  vi.mocked(getPabellonCatalogue).mockResolvedValueOnce(page("1","next")).mockResolvedValueOnce(page("2"));
  expect((await loadPabellonSmallCatalogue("communes")).map(i=>i.code)).toEqual(["1","2"]);
 });
 it("rejects changed versions, wrong groups and cursor loops",async()=>{
  vi.mocked(getPabellonCatalogue).mockResolvedValueOnce(page("1","next")).mockResolvedValueOnce({...page("2"),version:"b".repeat(64)});
  await expect(loadPabellonSmallCatalogue("communes")).rejects.toBeDefined();
  vi.mocked(getPabellonCatalogue).mockResolvedValueOnce({...page("1"),catalogue:"insurances"});
  await expect(loadPabellonSmallCatalogue("communes")).rejects.toBeDefined();
  vi.mocked(getPabellonCatalogue).mockResolvedValueOnce(page("1","next")).mockResolvedValueOnce(page("2","next"));
  await expect(loadPabellonSmallCatalogue("communes")).rejects.toBeDefined();
 });
});
