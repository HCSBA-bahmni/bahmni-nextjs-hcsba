import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { useEffect, useRef, useState } from "react";
import { assessBiometricFrame, type BiometricAssessment } from "@/services/biometrics";

interface Props {
  visible: boolean;
  title: string;
  actionLabel: string;
  busy?: boolean;
  error?: string;
  onHide(): void;
  onCapture(image: string): void;
}

function frameBlob(video: HTMLVideoElement, maxWidth: number): Promise<Blob | null> {
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .9));
}

function frameDataUrl(video: HTMLVideoElement): string {
  const scale = Math.min(1, 960 / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No fue posible preparar la captura de la cámara.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", .92);
}

export function BiometricCameraDialog({ visible, title, actionLabel, busy = false, error = "", onHide, onCapture }: Props) {
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(() => typeof navigator !== "undefined" && navigator.mediaDevices ? "" : "Este navegador no permite utilizar la cámara.");
  const [assessment, setAssessment] = useState<BiometricAssessment | null>(null);
  const [assessmentError, setAssessmentError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const assessmentInFlight = useRef(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const stop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    if (!navigator.mediaDevices) {
      return stop;
    }
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const playback = videoRef.current.play();
          if (playback && typeof playback.catch === "function") void playback.catch(() => setCameraError("La cámara se abrió, pero no fue posible reproducirla."));
        }
      })
      .catch(() => setCameraError("No fue posible acceder a la cámara. Revise el permiso del navegador."));
    return () => { cancelled = true; stop(); };
  }, [visible]);

  useEffect(() => {
    if (!visible || !cameraReady) return;
    let cancelled = false;
    const controller = new AbortController();
    const assess = async () => {
      if (assessmentInFlight.current) return;
      const video = videoRef.current;
      if (!video?.videoWidth || !video.videoHeight) return;
      assessmentInFlight.current = true;
      try {
        const blob = await frameBlob(video, 640);
        if (!blob || cancelled) return;
        const next = await assessBiometricFrame(blob, controller.signal);
        if (!cancelled) { setAssessment(next); setAssessmentError(""); }
      } catch (assessmentFailure) {
        if (!cancelled && !(assessmentFailure instanceof DOMException && assessmentFailure.name === "AbortError")) {
          setAssessment(null);
          setAssessmentError("No fue posible analizar el rostro. Verifique que el servicio biométrico esté disponible.");
        }
      } finally {
        assessmentInFlight.current = false;
      }
    };
    void assess();
    const timer = window.setInterval(() => void assess(), 700);
    return () => { cancelled = true; controller.abort(); window.clearInterval(timer); };
  }, [cameraReady, visible]);

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return setCameraError("La cámara todavía se está iniciando.");
    try { onCapture(frameDataUrl(video)); }
    catch (captureError) { setCameraError(captureError instanceof Error ? captureError.message : "No fue posible capturar el rostro."); }
  };

  return <Dialog header={title} visible={visible} modal className="patient-photo-dialog biometric-camera-dialog" closable={!busy} onHide={() => { if (!busy) onHide(); }}>
    <div className="patient-photo-camera">
      <div className="biometric-camera-video-frame">
        <video ref={videoRef} aria-label="Vista previa para validación biométrica" autoPlay muted playsInline onLoadedMetadata={() => setCameraReady(true)} />
        <div className={`patient-photo-face-guide ${assessment?.ready ? "ready" : ""}`} aria-hidden="true" />
        {assessment?.face && assessment.image_width > 0 && <svg className="patient-photo-face-overlay" viewBox={`0 0 ${assessment.image_width} ${assessment.image_height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g transform={`translate(${assessment.image_width} 0) scale(-1 1)`}><rect className={assessment.ready ? "ready" : "tracking"} x={assessment.face.x} y={assessment.face.y} width={assessment.face.width} height={assessment.face.height} rx="16" /></g></svg>}
      </div>
      {!cameraError && <p role="status" className={`patient-photo-assessment ${assessment?.ready ? "ready" : ""}`}><i className={`pi ${assessment?.ready ? "pi-check-circle" : "pi-user"}`} aria-hidden="true" /> {assessment?.message ?? (assessmentError || "Buscando un rostro…")}</p>}
      {cameraError && <p role="alert" className="warning-banner">{cameraError}</p>}
      {error && <p role="alert" className="error-banner">{error}</p>}
    </div>
    <div className="patient-photo-dialog-actions">
      <Button type="button" outlined label="Cancelar" disabled={busy} onClick={onHide} />
      <Button type="button" label={actionLabel} icon="pi pi-shield" loading={busy} disabled={!assessment?.ready || busy} onClick={capture} />
    </div>
    <p className="patient-photo-privacy-note"><i className="pi pi-info-circle" aria-hidden="true" /> El resultado es una ayuda para el operador y siempre requiere confirmación humana.</p>
  </Dialog>;
}
