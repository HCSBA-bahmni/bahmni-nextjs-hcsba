import { Button } from "primereact/button";
import { useEffect, useId, useRef, useState } from "react";

interface ScannerHandle {
  start(camera: string | { deviceId: { exact: string } }, config: Record<string, unknown>, success: (value: string) => void, failure?: () => void): Promise<void>;
  stop(): Promise<void>;
  clear(): Promise<void>;
}

export function QrCameraScanner({ onScan }: { onScan: (value: string) => void }) {
  const regionId = `qr-reader-${useId().replaceAll(":", "")}`;
  const scanner = useRef<ScannerHandle | undefined>(undefined);
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const stop = async () => {
    const current = scanner.current;
    scanner.current = undefined;
    if (current) {
      try { await current.stop(); } catch { /* already stopped */ }
      try { await current.clear(); } catch { /* detached region */ }
    }
    setActive(false);
  };

  useEffect(() => () => {
    const current = scanner.current;
    scanner.current = undefined;
    if (current) void current.stop().catch(() => undefined).then(() => current.clear().catch(() => undefined));
  }, []);

  const start = async () => {
    setPending(true); setError(""); setActive(true);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) throw new Error("No se encontraron cámaras disponibles.");
      const selected = cameras.find((camera) => /back|rear|environment|trasera/i.test(camera.label)) ?? cameras[0]!;
      const instance = new Html5Qrcode(regionId, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false }) as unknown as ScannerHandle;
      scanner.current = instance;
      await instance.start({ deviceId: { exact: selected.id } }, {
        fps: 12,
        aspectRatio: 1,
        qrbox: (width: number, height: number) => {
          const size = Math.floor(Math.min(280, Math.min(width, height) * 0.8));
          return { width: size, height: size };
        },
      }, (value) => { onScan(value); void stop(); }, () => undefined);
    } catch (cause) {
      await stop();
      setError(cause instanceof Error ? cause.message : "No fue posible iniciar la cámara.");
    } finally { setPending(false); }
  };

  return <div className="qr-camera-scanner">
    <Button type="button" outlined severity={active ? "danger" : undefined} icon={active ? "pi pi-stop" : "pi pi-camera"} label={active ? "Detener cámara" : "Escanear QR"} loading={pending} onClick={() => active ? void stop() : void start()} />
    {error && <p role="alert" className="error-banner">{error}</p>}
    <div id={regionId} className="qr-camera-region" hidden={!active} aria-label="Vista de cámara para leer QR" />
  </div>;
}
