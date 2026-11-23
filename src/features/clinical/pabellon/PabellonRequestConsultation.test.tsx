import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PabellonItem } from "@/services/bahmni/pabellon";
import { PabellonRequestConsultation, visibleConsultationFields, consultationFieldGroups } from "./PabellonRequestConsultation";
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ user: { uuid: "qa" } }) }));
vi.mock("./pabellonSmallCatalogue", () => ({ loadPabellonSmallCatalogue: vi.fn(async (group: string) => [{ sourceId: "1", display: group === "theatres" ? "PABELLON CENTRAL" : group === "blood-samples" ? "PLASMA" : "DM2" }]) }));
const field = (key: string, value: string | null, label = key) => ({ key, value, label });
function fixture() {
  return { id: "1", source: { environment: "pabellon43-dev", revision: "test" }, request: {
    catalogueSelections: { "preoperative-assessments": ["1"], theatres: ["1"], "blood-samples": [] },
    sections: [
      { key: "patient", title: "Datos del paciente", fields: [field("latex", "NO", "¿Alergia al látex?")] },
      { key: "hospitalization", title: "Hospitalización", fields: [field("hospitalized", "SI", "¿Paciente hospitalizado?")] },
      { key: "assessment", title: "Evaluación preoperatoria", fields: [field("asa", "1", "ASA"), field("assessment-other", null, "Otras evaluaciones"), field("theatre", "PABELLON CENTRAL")] },
      { key: "surgery", title: "Programación cirugía", fields: [field("laterality", "NO", "¿Requiere lateralidad?"), field("laterality-type", null, "Tipo de lateralidad"), field("approach", "Procedimiento cerrado", "Vía de abordaje"), field("approach-type", null, "Tipo de vía de abordaje"), field("oncology", "NO", "¿Paciente oncológico?")] },
      { key: "biopsy", title: "Biopsia", fields: [field("biopsy-type", null)] },
      { key: "blood", title: "Productos sanguíneos", fields: [] },
      { key: "supplies", title: "Insumos y equipos médicos", fields: [field("kits", null, "Kits solicitados")] },
      { key: "destination", title: "Prioridad y salida", fields: ["bed", "bed-type", "output-priority", "conditions", "origin-service", "priority-type"].map(key => field(key, null)) },
    ],
  } } as unknown as PabellonItem;
}
function show(item = fixture()) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PabellonRequestConsultation item={item} /></QueryClientProvider>);
}
describe("Read-only request matches native conditional controls", () => {
  it("orders identification, demographics and contact in coherent rows without losing fields", () => {
    const keys = ["telephone", "age", "second-surname", "identification", "names", "first-surname", "birth-date", "address", "commune", "address-number", "extra"];
    const section = { key: "patient", title: "Paciente", fields: keys.map(key => field(key, "test")) };
    const groups = consultationFieldGroups(section, section.fields);
    expect(groups[0]!.map(field => field.key)).toEqual(["identification", "names", "first-surname", "second-surname"]);
    expect(groups[1]!.map(field => field.key)).toEqual(["birth-date", "age"]);
    expect(groups[2]!.map(field => field.key)).toEqual(["telephone", "commune", "address", "address-number"]);
    expect(groups.flat().map(field => field.key).sort()).toEqual([...keys].sort());
  });
  it("keeps surgical header, approach and narrative in separate rows", () => {
    const keys = ["procedures", "duration", "specialty", "surgeon", "approach", "additional-plan", "laterality", "surgery-type"];
    const section = { key: "surgery", title: "Programación", fields: keys.map(key => field(key, "test")) };
    const groups = consultationFieldGroups(section, section.fields);
    expect(groups[0]!.map(field => field.key)).toEqual(["surgeon", "specialty", "duration"]);
    expect(groups[1]!.map(field => field.key)).toEqual(["approach"]);
    expect(groups[2]!.map(field => field.key)).toEqual(["procedures"]);
  });
  it("renders checked native choices, ASA and location without write controls", async () => {
    show();
    const assessment = screen.getByRole("region", { name: "Evaluación preoperatoria" });
    expect(await within(assessment).findByLabelText("DM2")).toBeChecked();
    expect(within(assessment).getByLabelText("DM2")).toBeDisabled();
    expect(within(assessment).getByLabelText("PABELLON CENTRAL")).toBeChecked();
    expect(within(assessment).getByLabelText("ASA")).toHaveValue("1");
    expect(screen.queryByLabelText("Otras evaluaciones")).not.toBeInTheDocument();
  });
  it("merges patient answers and hides a negative laterality subtype", async () => {
    show(); await waitFor(() => expect(screen.getByLabelText("ASA")).toBeInTheDocument());
    const patient = screen.getByRole("region", { name: "Datos del paciente" });
    expect(within(patient).getByRole("group", { name: "¿Paciente oncológico?" })).toHaveAttribute("data-answer", "no");
    expect(within(patient).getByRole("group", { name: "¿Paciente hospitalizado?" })).toHaveAttribute("data-answer", "yes");
    expect(screen.queryByLabelText("Tipo de lateralidad")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de vía de abordaje")).toHaveValue("No informado en esta snapshot");
  });
  it("uses absence messages without drawing conditional empty details", async () => {
    show();
    expect(screen.getByText("No se definió prioridad de salida del paciente")).toBeInTheDocument();
    expect(screen.getByText("No se solicitaron productos sanguíneos para esta solicitud")).toBeInTheDocument();
    expect(screen.getByText("No se registró una biopsia en esta snapshot.")).toBeInTheDocument();
    expect(screen.getByLabelText("Kits solicitados")).toHaveValue("No se registraron kits en esta snapshot");
  });
  it("keeps positive laterality and required subtype even if historical value is missing", () => {
    const section = fixture().request!.sections!.find(section => section.key === "surgery")!;
    section.fields.find(field => field.key === "laterality")!.value = "SI";
    expect(visibleConsultationFields(section).some(field => field.key === "laterality-type")).toBe(true);
    section.fields.find(field => field.key === "approach")!.value = "Abierta";
    expect(visibleConsultationFields(section).some(field => field.key === "approach-type")).toBe(false);
  });
});
