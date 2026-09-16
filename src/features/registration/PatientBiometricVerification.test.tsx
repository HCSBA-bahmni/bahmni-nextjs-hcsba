import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BiometricVerificationResult } from "./PatientBiometricVerification";

const quality = { detector_confidence: .99, face_width: 100, face_height: 110, image_width: 640, image_height: 480 };

describe("BiometricVerificationResult", () => {
  it("shows a positive score as an operator reference, not an automatic identity", () => {
    render(<BiometricVerificationResult result={{ mpi_id: "p1", template_found: true, best_template_id: "9ca37da1-8432-4d90-b295-59a92b980485", similarity: .712, threshold_reference: .363, above_threshold: true, decision: "client_confirmation_required", quality }} />);
    expect(screen.getByText("Coincidencia biométrica sobre la referencia")).toBeVisible();
    expect(screen.getByText(/Similitud 71.2%/)).toHaveTextContent("Confirme siempre con los datos del paciente");
  });

  it("explains when the patient has no enrolled template", () => {
    render(<BiometricVerificationResult result={{ mpi_id: "p1", template_found: false, best_template_id: null, similarity: null, threshold_reference: .363, above_threshold: null, decision: "client_confirmation_required", quality }} />);
    expect(screen.getByText("Paciente sin plantilla biométrica")).toBeVisible();
  });
});
