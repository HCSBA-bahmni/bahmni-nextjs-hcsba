import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PabellonProtocolVersion } from "@/services/bahmni/pabellonProtocols";
import { PabellonProtocolConsultation } from "./PabellonProtocolConsultation";
const version = () => ({ snapshotId: "1", clinical: {
  patientAtRegistration: { givenNames: "FROZEN", familyName: "PATIENT", secondFamilyName: null },
  surgeon: "FROZEN SURGEON", diagnosis: "POSTOPERATIVE", surgicalDetail: "FROZEN DETAIL",
  laterality: null, additionalProcedure: null, observations: null, procedures: [{ display: "PLAN ORIGINAL", code: "1" }],
  team: [{ name: "PROFESSIONAL", role: { display: "AYUDANTE", code: "2" } }],
} }) as PabellonProtocolVersion;
describe("Protocol native read layout", () => {
  it("renders the complete protocol-only projection including false, zero and frozen identifiers", () => {
    const v = version();
    const keys = ["dates", "patient", "team", "intervention", "preoperative", "extras", "postoperative", "detail", "authorship"] as const;
    v.clinical.sections = keys.map(key => ({ key, title: key, fields: [] }));
    v.clinical.sections[1]!.fields = [{ key: "identification", label: "RUT congelado", value: "FROZEN-ID" }, { key: "birth-date", label: "Nacimiento", value: "2000-01-01" }];
    v.clinical.sections[5]!.fields = [{ key: "alive", label: "Condición de salida: vivo/a", value: "NO" }, { key: "blood-loss", label: "Pérdida sanguínea", value: "0" }];
    v.clinical.sections[6]!.fields = [{ key: "lateral", label: "Lateralidad", value: "NO" }, { key: "side", label: "Lado que no aplica", value: "derecha" }];
    render(<PabellonProtocolConsultation version={v} />);
    expect(screen.getByLabelText("RUT congelado")).toHaveValue("FROZEN-ID");
    expect(screen.getByLabelText("Nacimiento")).toHaveValue("01/01/2000");
    expect(screen.getByLabelText("Pérdida sanguínea")).toHaveValue("0");
    expect(screen.getByRole("group", { name: "Condición de salida: vivo/a" })).toHaveAttribute("data-answer", "no");
    expect(screen.queryByLabelText("Lado que no aplica")).not.toBeInTheDocument();
    expect(screen.queryByText(/aún no incluye/)).not.toBeInTheDocument();
  });
  it("uses frozen values in compact read-only fields and native sections", () => {
    render(<PabellonProtocolConsultation version={version()} />);
    expect(screen.getByLabelText("Nombre")).toHaveValue("FROZEN PATIENT");
    expect(screen.getByLabelText("Cirujano")).toHaveValue("FROZEN SURGEON");
    expect(screen.getByLabelText("Rol")).toHaveValue("AYUDANTE");
    expect(screen.getByLabelText("Detalle operatorio")).toHaveAttribute("readonly");
    expect(screen.getByRole("region", { name: "Datos del equipo médico" })).toBeInTheDocument();
  });
  it("does not invent a NO or show empty optional observations", () => {
    render(<PabellonProtocolConsultation version={version()} />);
    expect(screen.getByLabelText("Tipo de lateralidad postoperatoria")).toHaveValue("No informado en la respuesta de esta versión");
    expect(screen.queryByLabelText("Observaciones")).not.toBeInTheDocument();
    expect(screen.queryByText("NO")).not.toBeInTheDocument();
  });
});
