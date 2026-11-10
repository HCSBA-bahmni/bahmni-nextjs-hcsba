import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PabellonPatientContactFields } from "./PabellonPatientContactFields";
import { emptyPabellonContactDraft } from "./pabellonContactDraft";
import type { ClinicalPatientContext } from "../patientContext";
const patient: ClinicalPatientContext = { uuid: crypto.randomUUID(), name: "QA PACIENTE", givenNames: "QA", familyName: "PACIENTE", secondFamilyName: "", identifier: "QA-1", gender: "U", address: "", image: "", attributes: [], relationships: [] };
type Props = React.ComponentProps<typeof PabellonPatientContactFields>;
function show(extra: Partial<Props> = {}) {
  const props: Props = { scopeKey: "qa:patient", patient, value: emptyPabellonContactDraft(), issues: [], overrides: {}, onChange: vi.fn(), onRefresh: vi.fn(), ...extra };
  const client = new QueryClient();
  const node = (p: Props) => <QueryClientProvider client={client}><PabellonPatientContactFields {...p} /></QueryClientProvider>;
  const view = render(node(props));
  return { props, ...view, change: (p: Partial<Props>) => view.rerender(node({ ...props, ...p })) };
}
describe("Patient information from native HIS registration", () => {
  it("keeps native identity read-only and offers request-local contact corrections", () => {
    const { props } = show({ issues: ["Falta un dato en Registro."] });
    expect(screen.getByText("QA")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Nombres" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Dirección *"), { target: { value: "QA REQUEST ONLY" } });
    expect(props.onChange).toHaveBeenCalledWith({ address: "QA REQUEST ONLY" });
    expect(screen.getByRole("link", { name: "Revisar o completar Registro del paciente" })).toHaveAttribute("href", "/registration/patient/" + patient.uuid);
    expect(screen.getByText("Falta un dato en Registro.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Apellido materno")).toBeInTheDocument();
    expect(screen.queryByText("NULL")).not.toBeInTheDocument();
  });
  it("prevents repeated refresh during loading and releases it on failure", () => {
    const { props, change } = show({ loading: true });
    expect(screen.getByRole("button", { name: "Actualizar datos del Registro" })).toBeDisabled();
    expect(screen.getByLabelText("Dirección *")).toBeDisabled();
    change({ loading: false, error: true });
    const button = screen.getByRole("button", { name: "Actualizar datos del Registro" });
    expect(button).toBeEnabled(); fireEvent.click(button); expect(props.onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("No fue posible cargar");
  });
  it("locks all corrections and refresh in the review step", () => {
    show({ disabled: true });
    expect(screen.getByLabelText("Dirección *")).toBeDisabled();
    expect(screen.getByLabelText(/^Comuna/)).toBeDisabled();
    expect(screen.getByLabelText(/^Sexo \(catálogo Pabellón\)/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Actualizar datos del Registro" })).toBeDisabled();
  });
  it("shows tramo only for the original FONASA code and labels request corrections", () => {
    const value = { ...emptyPabellonContactDraft(), insurance: { sourceId: "8", code: "1", display: "FONASA", system: "urn:hcsba:personas:catalogue:insurances", active: true as const, relations: [] } };
    const { change } = show({ value, overrides: { address: "QA" } });
    expect(screen.getByLabelText("Tramo FONASA *")).toBeInTheDocument();
    expect(screen.getByText("Completado o corregido para esta solicitud.")).toBeInTheDocument();
    change({ value: { ...value, insurance: { ...value.insurance, code: "2", display: "ISAPRE" } } });
    expect(screen.queryByLabelText("Tramo FONASA *")).not.toBeInTheDocument();
  });
});
