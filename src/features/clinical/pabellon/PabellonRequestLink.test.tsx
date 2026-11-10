import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {describe,expect,it,vi} from "vitest";
import {PabellonRequestLink} from "./PabellonRequestLink";
import {requestPabellonLink} from "@/services/bahmni/pabellonRequestLink";
import type {ClinicalDashboardContext} from "../dashboardContext";
vi.mock("@/services/bahmni/pabellonRequestLink",()=>({requestPabellonLink:vi.fn()}));
const patient="22222222-2222-4222-8222-222222222222",visit="44444444-4444-4444-8444-444444444444";
const context={patient:{uuid:patient},visits:[{uuid:visit,voided:false,startDatetime:"2026-11-01T12:00:00Z",stopDatetime:null,visitType:{display:"IPD"}}],locale:"es-CL",timeZone:"America/Santiago"} as unknown as ClinicalDashboardContext;
const result={surgeryId:"12",requestNumber:"261105001",version:1,visitUuid:visit,encounterUuid:"",active:true};
const open=()=>{render(<PabellonRequestLink context={context} onChanged={vi.fn()}/>);fireEvent.click(screen.getByText("Vincular solicitud existente"));fireEvent.change(screen.getByLabelText("N° de solicitud *"),{target:{value:"261105001"}})};
describe("existing request care association",()=>{
 it("previews without creating a link and requires confirmation before unlinking",async()=>{
  vi.mocked(requestPabellonLink).mockResolvedValue(result);open();
  fireEvent.click(screen.getByText("Verificar solicitud"));await screen.findByText("Desvincular");
  expect(requestPabellonLink).toHaveBeenCalledTimes(1);expect(vi.mocked(requestPabellonLink).mock.calls[0]![1].action).toBe("preview");
  fireEvent.click(screen.getByText("Desvincular"));expect(requestPabellonLink).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Confirmar"));await waitFor(()=>expect(requestPabellonLink).toHaveBeenCalledTimes(2));
  expect(vi.mocked(requestPabellonLink).mock.calls[1]![1]).toMatchObject({action:"unlink",expectedVersion:1,visitUuid:""});
 });
 it("clears a preview when the request number changes",async()=>{
  vi.mocked(requestPabellonLink).mockResolvedValue(result);open();fireEvent.click(screen.getByText("Verificar solicitud"));await screen.findByText("Desvincular");
  fireEvent.change(screen.getByLabelText("N° de solicitud *"),{target:{value:"261105002"}});expect(screen.queryByText("Desvincular")).toBeNull();
 });
 it("ends loading on failure and permits a new verification",async()=>{
  vi.mocked(requestPabellonLink).mockRejectedValue(new Error("network"));open();fireEvent.click(screen.getByText("Verificar solicitud"));await screen.findByRole("alert");
  expect(screen.getByText("Verificar solicitud").closest("button")).not.toBeDisabled();
 });
});
