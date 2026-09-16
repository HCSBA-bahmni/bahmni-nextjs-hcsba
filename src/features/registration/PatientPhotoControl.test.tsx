import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PatientPhotoControl } from "./PatientPhotoControl";

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
afterEach(() => {
  vi.restoreAllMocks();
  if (originalMediaDevices) Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  else Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("PatientPhotoControl", () => {
  it("shows the persisted patient photo and exposes a new-photo action", () => {
    render(<PatientPhotoControl image="/openmrs/ws/rest/v1/patientImage?patientUuid=p1" patientName="Ana Pérez" onCapture={() => undefined} onFileSelect={() => undefined} />);
    expect(screen.getByRole("img", { name: "Fotografía del paciente" }).getAttribute("src")).toContain("/openmrs/ws/rest/v1/patientImage?patientUuid=p1");
    expect(screen.getByRole("button", { name: "Tomar nueva foto" })).toBeVisible();
  });

  it("falls back to patient initials when the stored image cannot load", () => {
    render(<PatientPhotoControl image="/missing-photo" patientName="Ana Pérez" onCapture={() => undefined} onFileSelect={() => undefined} />);
    fireEvent.error(screen.getByRole("img", { name: "Fotografía del paciente" }));
    expect(screen.getByRole("img", { name: "Paciente sin fotografía" })).toHaveTextContent("AP");
  });

  it("returns the selected camera file", () => {
    const onFileSelect = vi.fn();
    render(<PatientPhotoControl patientName="Ana" onCapture={() => undefined} onFileSelect={onFileSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Tomar nueva foto" }));
    expect(screen.getByRole("dialog", { name: "Tomar foto del paciente" })).toBeVisible();
    const file = new File(["photo"], "patient.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText("Seleccionar fotografía del paciente");
    expect(input).toHaveAttribute("capture", "user");
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it("captures a square frame from the webcam and confirms it", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,PHOTO");
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["preview"], { type: "image/jpeg" })));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "ready", ready: true, message: "Rostro en posición. Ya puede tomar la fotografía.", face_count: 1, image_width: 640, image_height: 480, face: { x: 200, y: 80, width: 200, height: 260, confidence: .99 } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const onCapture = vi.fn();
    render(<PatientPhotoControl patientName="Ana" onCapture={onCapture} onFileSelect={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Tomar nueva foto" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }));
    const video = screen.getByLabelText("Vista previa de la cámara");
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 640 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 480 });
    fireEvent.loadedMetadata(video);
    await screen.findByText("Rostro en posición. Ya puede tomar la fotografía.");
    fireEvent.click(screen.getByRole("button", { name: "Capturar" }));
    expect(screen.getByRole("img", { name: "Vista previa de la nueva fotografía" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Usar y registrar biometría" }));
    expect(onCapture).toHaveBeenCalledWith("data:image/jpeg;base64,PHOTO", { enrollBiometric: true });
    expect(stop).toHaveBeenCalled();
  });

  it("allows a clinical-only photo when biometric assessment is unavailable", async () => {
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["preview"], { type: "image/jpeg" })));
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,PHOTO");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const onCapture = vi.fn();
    render(<PatientPhotoControl patientName="Ana" onCapture={onCapture} onFileSelect={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Tomar nueva foto" }));
    const video = await screen.findByLabelText("Vista previa de la cámara");
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 640 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 480 });
    fireEvent.loadedMetadata(video);
    await screen.findByText("La guía biométrica no está disponible. Puede guardar solamente la fotografía.");
    fireEvent.click(screen.getByRole("button", { name: "Capturar solo fotografía" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar solo como foto" }));
    expect(onCapture).toHaveBeenCalledWith("data:image/jpeg;base64,PHOTO", { enrollBiometric: false });
  });
});
