import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PatientForm } from "./PatientForm";
import { fonasaRegistrationConcept } from "./registryDetails";
import { parseRegistrationConfig } from "@/config-compat/registrationConfig";
vi.mock("./PatientBiometricVerification",()=>({PatientBiometricVerification:()=>null}));
vi.mock("./useRegistrationTranslations",()=>({useRegistrationTranslations:()=>undefined}));
vi.mock("@/services/bahmni/metadata",async original=>({...await original<typeof import("@/services/bahmni/metadata")>(),getConceptAnswers:vi.fn().mockResolvedValue([{uuid:"e8200001-0000-4000-8000-000000000001",display:"FONASA"}])}));
const types=[{uuid:"n",name:"addressNumber",description:"N° casa / departamento",format:"java.lang.String"},{uuid:"s",name:"fonasaSegment",description:"Tramo FONASA",format:"java.lang.String"},{uuid:"p",name:"basicHealthInsurance",description:"Previsión",concept:{uuid:"concept",display:"Previsión"}}];
function show(coverage:string,segment?:string) {
 const onSave=vi.fn().mockResolvedValue(undefined);
 const config=parseRegistrationConfig({config:{showEnterID:false,patientInformation:{additionalPatientInformation:{title:"Datos del paciente",attributes:["basicHealthInsurance"]}}}});
 const view=render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PatientForm initial={{uuid:"qa",givenName:"QA",familyName:"PRUEBA",gender:"U",birthDate:"2000-01-01",identifier:"QA1",attributes:{n:"S/N",p:coverage,...segment?{s:segment}:{}},relationships:[]}} attributeTypes={types} identifierTypes={[]} addressLevels={[]} config={config} activeLocationUuid="qa-location" onSave={onSave} onGenerateId={vi.fn()}/></QueryClientProvider>);
 return {...view,onSave};
}
describe("Native registry positioning",()=>{
 it("places house number in the address step, then displays FONASA segment only with FONASA",()=>{
  show(fonasaRegistrationConcept);
  fireEvent.click(screen.getByRole("button",{name:"Siguiente"}));
  expect(screen.getByLabelText("N° casa / departamento *")).toHaveValue("S/N");
  expect(screen.getByLabelText("N° casa / departamento *")).toHaveAttribute("maxlength","20");
  fireEvent.click(screen.getByRole("button",{name:"Siguiente"}));
  expect(screen.getByLabelText("Tramo FONASA *")).toBeInTheDocument();
  expect(screen.queryAllByLabelText("N° casa / departamento *")).toHaveLength(1);
 });
 it("hides and clears stale FONASA segment on a non-FONASA patient",async()=>{
  const {onSave}=show("other-coverage","C");
  fireEvent.click(screen.getByRole("button",{name:"Siguiente"}));fireEvent.click(screen.getByRole("button",{name:"Siguiente"}));
  expect(screen.queryByLabelText("Tramo FONASA *")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Guardar paciente"}));
  await waitFor(()=>expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0]?.[0].attributes.s).toBeUndefined();
 });
});
