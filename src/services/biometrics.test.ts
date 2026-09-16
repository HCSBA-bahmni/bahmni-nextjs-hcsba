import { afterEach, describe, expect, it, vi } from "vitest";
import { assessBiometricFrame, BiometricApiError, enrollPatientBiometrics, patientPhotoDataUrlToBlob, searchPatientBiometrics, verifyPatientBiometrics } from "./biometrics";

afterEach(() => vi.restoreAllMocks());

const assessment = { status: "ready", ready: true, message: "Rostro listo", face_count: 1, image_width: 640, image_height: 480, face: { x: 1, y: 2, width: 3, height: 4, confidence: 0.99 } };

describe("biometric service", () => {
  it("assesses camera frames through the same-origin API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(assessment), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(assessBiometricFrame(new Blob(["photo"], { type: "image/jpeg" }))).resolves.toEqual(assessment);
    expect(fetchMock).toHaveBeenCalledWith("/biometric-api/biometric/assess", expect.objectContaining({ method: "POST", credentials: "include" }));
  });

  it("enrolls the OpenMRS patient UUID instead of a visible identifier", async () => {
    const result = { template_id: "9ca37da1-8432-4d90-b295-59a92b980485", mpi_id: "patient-uuid", model: "opencv-sface:2021dec", quality: { detector_confidence: .99, face_width: 100, face_height: 100, image_width: 480, image_height: 480 }, created_at: "2026-09-16T12:00:00Z" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(result), { status: 201, headers: { "Content-Type": "application/json" } }));
    await enrollPatientBiometrics("patient-uuid", "data:image/jpeg;base64,UEhPVE8=");
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("mpi_id")).toBe("patient-uuid");
    expect(body.get("image")).toBeInstanceOf(Blob);
  });

  it("rejects non-image data URLs before sending sensitive data", () => {
    expect(() => patientPhotoDataUrlToBlob("data:text/plain;base64,VEVTVA==")).toThrow("formato biométrico compatible");
  });

  it("preserves safe API error messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "multiple_faces", message: "Debe aparecer una sola persona." } }), { status: 400, headers: { "Content-Type": "application/json" } }));
    await expect(assessBiometricFrame(new Blob(["photo"], { type: "image/jpeg" }))).rejects.toEqual(expect.objectContaining<Partial<BiometricApiError>>({ status: 400, code: "multiple_faces", message: "Debe aparecer una sola persona." }));
  });

  it("searches candidates without converting the score into an identity decision", async () => {
    const result = { candidates: [{ mpi_id: "patient-1", template_id: "9ca37da1-8432-4d90-b295-59a92b980485", similarity: .71, model: "opencv-sface:2021dec", created_at: "2026-09-16T12:00:00Z" }], threshold_reference: .363, decision: "human_review_required", quality: { detector_confidence: .99, face_width: 100, face_height: 100, image_width: 480, image_height: 480 } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(searchPatientBiometrics("data:image/jpeg;base64,UEhPVE8=", 8)).resolves.toEqual(result);
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/biometric-api/biometric/search");
    expect(body.get("top_k")).toBe("8");
  });

  it("verifies a camera frame against the OpenMRS patient UUID", async () => {
    const result = { mpi_id: "patient-1", template_found: true, best_template_id: "9ca37da1-8432-4d90-b295-59a92b980485", similarity: .72, threshold_reference: .363, above_threshold: true, decision: "client_confirmation_required", quality: { detector_confidence: .99, face_width: 100, face_height: 100, image_width: 480, image_height: 480 } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(verifyPatientBiometrics("patient-1", "data:image/jpeg;base64,UEhPVE8=")).resolves.toEqual(result);
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("mpi_id")).toBe("patient-1");
  });
});
