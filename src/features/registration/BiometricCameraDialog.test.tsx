import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BiometricCameraDialog } from "./BiometricCameraDialog";

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

afterEach(() => {
  vi.restoreAllMocks();
  if (originalMediaDevices) Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  else Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("BiometricCameraDialog", () => {
  it("only captures after the API reports a ready face", async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["preview"], { type: "image/jpeg" })));
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,RkFDRQ==");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "ready", ready: true, message: "Rostro listo", face_count: 1, image_width: 640, image_height: 480, face: { x: 200, y: 80, width: 180, height: 220, confidence: .98 } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const onCapture = vi.fn();
    const { unmount } = render(<BiometricCameraDialog visible title="Validar" actionLabel="Comparar" onHide={() => undefined} onCapture={onCapture} />);
    const action = screen.getByRole("button", { name: "Comparar" });
    expect(action).toBeDisabled();
    const video = screen.getByLabelText("Vista previa para validación biométrica");
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 640 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 480 });
    fireEvent.loadedMetadata(video);
    await screen.findByText("Rostro listo");
    await waitFor(() => expect(action).toBeEnabled());
    fireEvent.click(action);
    expect(onCapture).toHaveBeenCalledWith("data:image/jpeg;base64,RkFDRQ==");
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
