import type { ClinicalPatientContext } from "../patientContext";
import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import type { PabellonPersonasPrefill } from "@/services/bahmni/pabellonPersonas";
import { emptyPabellonContactDraft } from "./pabellonContactDraft";

export function mapPersonasPrefill(data: PabellonPersonasPrefill, patient: ClinicalPatientContext, masters: { communes: PabellonCatalogueOption[]; insurances: PabellonCatalogueOption[]; sexes: PabellonCatalogueOption[] }) {
  const p = data.record; const draft = emptyPabellonContactDraft(); const issues: string[] = [];
  draft.telephone = p.telephone; draft.address = p.address; draft.addressNumber = p.addressNumber;
  const match = (group: "communes" | "insurances" | "sexes", code: string) => {
    const found = masters[group].filter(item => item.active && item.system === "urn:hcsba:personas:catalogue:" + group && item.code === code);
    return found.length === 1 ? found[0]! : null;
  };
  draft.commune = match("communes", p.communeCode); draft.insurance = match("insurances", p.insuranceCode); draft.sex = match("sexes", p.sexCode);
  if (draft.insurance?.code === "1" && ["A", "B", "C", "D"].includes(p.insuranceSegment)) draft.insuranceSegment = p.insuranceSegment as "A" | "B" | "C" | "D";
  if (!draft.commune) issues.push("Seleccione comuna: Personas no entregó un código con correspondencia única en el maestro de Pabellón.");
  if (!draft.insurance) issues.push("Seleccione previsión: Personas no entregó un código con correspondencia única en el maestro de Pabellón.");
  if (!draft.sex) issues.push("Seleccione sexo: Personas no entregó un código con correspondencia única en el maestro de Pabellón.");
  const compare = (v: string | undefined) => (v ?? "").trim().normalize("NFC").toLocaleUpperCase("es");
  const differences = [
    ["Nombres", patient.givenNames, p.names], ["Apellido paterno", patient.familyName, p.firstSurname],
    ["Apellido materno", patient.secondFamilyName, p.secondSurname], ["Fecha de nacimiento", patient.birthDate?.slice(0, 10), p.birthDate],
  ].filter(([, his, person]) => compare(his) !== compare(person)).map(([label]) => label!);
  // Age is intentionally not copied from the HIS when DOB comes from Personas.
  const now = new Date(); const [year, month, day] = p.birthDate.split("-").map(Number);
  const age = now.getFullYear() - year! - (now.getMonth() + 1 < month! || now.getMonth() + 1 === month! && now.getDate() < day! ? 1 : 0);
  return { draft, issues, differences, patient: { ...patient, givenNames: p.names, familyName: p.firstSurname, secondFamilyName: p.secondSurname, birthDate: p.birthDate, birthDateEstimated: false, age, name: [p.names, p.firstSurname, p.secondSurname].filter(Boolean).join(" ") } };
}
