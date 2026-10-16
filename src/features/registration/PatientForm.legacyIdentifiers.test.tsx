import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseRegistrationConfig } from "@/config-compat/registrationConfig";
import { isIdentifierLocationValidationError, PatientForm } from "./PatientForm";
import { toPatientProfilePayload } from "./mappers";

vi.mock("./PatientBiometricVerification", () => ({ PatientBiometricVerification: () => null }));
vi.mock("./useRegistrationTranslations", () => ({ useRegistrationTranslations: () => undefined }));

describe("legacy patient identifiers", () => {
  it("keeps a prior clinical alias, places manual RUN first, and never infers a source for existing values", async () => {
    const config = parseRegistrationConfig({ config: {
      showEnterID: false,
      defaultIdentifierPrefix: "HCSBA",
      prominentExtraIdentifierTypes: ["RUN"],
      hiddenExtraIdentifierTypes: ["CRID MPI"],
      identifierMetadata: { RUN: { typeCode: "1", use: "official", issuerCountryCode: "152" } },
    } });
    const identifierTypes = [
      { uuid: "clinical", name: "Patient Identifier", display: "Patient Identifier", primary: true, required: true, identifierSources: [{ uuid: "cl", name: "CL", prefix: "CL" }, { uuid: "hcsba", name: "HCSBA", prefix: "HCSBA" }] },
      { uuid: "run", name: "RUN", display: "RUN", primary: false, required: false, identifierSources: [] },
    ];
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<QueryClientProvider client={new QueryClient()}><PatientForm
      initial={{ uuid: "patient-1", givenName: "Persona", familyName: "Prueba", gender: "F", birthDate: "1990-01-01", identifier: "HCSBA100002", identifierTypeUuid: "clinical", additionalIdentifiers: [
        { uuid: "old-id", identifier: "CLRUN*12345678-5", identifierTypeUuid: "clinical" },
        { uuid: "run-id", identifier: "12345678-5", identifierTypeUuid: "run" },
        { uuid: "crid-id", identifier: "mpi-master-1", identifierTypeUuid: "crid" },
      ], attributes: {}, relationships: [] }}
      activeLocationUuid="location-1" identifierTypes={identifierTypes} config={config} onGenerateId={vi.fn()} onSave={onSave}
    /></QueryClientProvider>);

    expect(screen.getByLabelText("RUN", { exact: true })).toHaveValue("12345678-5");
    expect(screen.queryByRole("button", { name: "Generar RUN" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByLabelText("Número de ficha")).toHaveValue("HCSBA100002");
    expect(screen.getByLabelText("Número clínico anterior")).toHaveValue("CLRUN*12345678-5");
    expect(screen.queryByLabelText("CRID MPI")).not.toBeInTheDocument();
    expect(screen.queryByText("Fuente / prefijo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar paciente" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const values = onSave.mock.calls[0]?.[0];
    expect(values.identifier).toBe("HCSBA100002");
    expect(values.additionalIdentifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: "old-id", identifier: "CLRUN*12345678-5", identifierSourceUuid: undefined }),
      expect.objectContaining({ uuid: "run-id", identifier: "12345678-5" }),
      expect.objectContaining({ uuid: "crid-id", identifier: "mpi-master-1" }),
    ]));
    expect(toPatientProfilePayload(values).patient.identifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ identifier: "HCSBA100002", preferred: true }),
      expect.objectContaining({ uuid: "old-id", identifier: "CLRUN*12345678-5", preferred: false }),
      expect.objectContaining({ uuid: "run-id", identifier: "12345678-5", preferred: false }),
      expect.objectContaining({ uuid: "crid-id", identifier: "mpi-master-1", location: "location-1", preferred: false }),
    ]));
  });

  it("recognizes the translated OpenMRS identifier-location validation", () => {
    expect(isIdentifierLocationValidationError(new Error("Patient failed: Id Localidad no puede ser nulo"))).toBe(true);
    expect(isIdentifierLocationValidationError(new Error("El RUN ya existe"))).toBe(false);
  });

  it("marks a missing identifier location in the form before sending the patient", async () => {
    const config = parseRegistrationConfig({ config: { showEnterID: false } });
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<QueryClientProvider client={new QueryClient()}><PatientForm
      initial={{ uuid: "patient-2", givenName: "Persona", familyName: "Prueba", gender: "F", birthDate: "1990-01-01", identifier: "HCSBA200", identifierTypeUuid: "clinical", attributes: {}, relationships: [] }}
      identifierTypes={[{ uuid: "clinical", name: "Patient Identifier", primary: true, required: true, identifierSources: [] }]}
      config={config} onGenerateId={vi.fn()} onSave={onSave}
    /></QueryClientProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar paciente" }));

    expect(await screen.findByText("La ficha clínica necesita una ubicación de atención antes de guardar.")).toBeVisible();
    const summaries = screen.getAllByText("Revise los campos destacados antes de guardar el paciente.");
    expect(summaries.find((element) => element.closest(".patient-form-error-summary"))?.closest("[role=alert]")).toHaveFocus();
    expect(await screen.findByText("Revise el formulario")).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });
});
