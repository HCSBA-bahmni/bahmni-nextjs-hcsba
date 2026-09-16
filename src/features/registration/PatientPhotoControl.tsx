import Image from "next/image";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { assessBiometricFrame, type BiometricAssessment } from "@/services/biometrics";

interface PatientPhotoControlProps {
  image?: string;
  patientName: string;
  onCapture(image: string, options?: { enrollBiometric: boolean }): void;
  onFileSelect(file?: File): void;
}

function patientInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "P";
  return words.slice(0, 2).map((word) => word.charAt(0).toLocaleUpperCase()).join("");
}

export function PatientPhotoControl({ image, patientName, onCapture, onFileSelect }: PatientPhotoControlProps) {
  const [failedImage, setFailedImage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedImage, setCapturedImage] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [assessment, setAssessment] = useState<BiometricAssessment | null>(null);
  const [assessmentError, setAssessmentError] = useState("");
  const [capturedWithBiometricQuality, setCapturedWithBiometricQuality] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const assessmentInFlightRef = useRef(false);

  useEffect(() => {
    if (!dialogOpen || capturedImage) return;
    let cancelled = false;
    const stopCamera = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraReady(false);
      setAssessment(null);
    };
    if (!navigator.mediaDevices?.getUserMedia) return stopCamera;
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const playback = videoRef.current.play();
          if (playback && typeof playback.catch === "function") void playback.catch(() => setCameraError("La cámara se abrió, pero no fue posible reproducir la vista previa."));
        }
      })
      .catch(() => setCameraError("No fue posible acceder a la cámara. Revise el permiso del navegador o seleccione una imagen."));
    return () => { cancelled = true; stopCamera(); };
  }, [capturedImage, dialogOpen]);

  useEffect(() => {
    if (!dialogOpen || capturedImage || !cameraReady) return;
    let cancelled = false;
    const controller = new AbortController();
    const assess = async () => {
      if (assessmentInFlightRef.current) return;
      const video = videoRef.current;
      if (!video?.videoWidth || !video.videoHeight) return;
      assessmentInFlightRef.current = true;
      try {
        const scale = Math.min(1, 640 / video.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .82));
        if (!blob || cancelled) return;
        const result = await assessBiometricFrame(blob, controller.signal);
        if (!cancelled) {
          setAssessment(result);
          setAssessmentError("");
        }
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          setAssessment(null);
          setAssessmentError("La guía biométrica no está disponible. Puede guardar solamente la fotografía.");
        }
      } finally {
        assessmentInFlightRef.current = false;
      }
    };
    void assess();
    const timer = window.setInterval(() => void assess(), 700);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [cameraReady, capturedImage, dialogOpen]);

  const closeDialog = () => {
    setDialogOpen(false);
    setCapturedImage("");
    setCameraError("");
    setAssessmentError("");
    setCapturedWithBiometricQuality(false);
  };
  const openDialog = () => {
    setCameraError(typeof navigator.mediaDevices?.getUserMedia === "function" ? "" : "Este navegador no permite acceder a la cámara. Puede seleccionar una imagen desde el dispositivo.");
    setAssessment(null);
    setAssessmentError("");
    setDialogOpen(true);
  };
  const retryCapture = () => {
    setCameraError("");
    setCapturedImage("");
    setCapturedWithBiometricQuality(false);
  };
  const captureFrame = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return setCameraError("La cámara todavía se está iniciando. Intente nuevamente.");
    const canvas = document.createElement("canvas");
    const sourceSize = Math.min(video.videoWidth, video.videoHeight);
    const sourceX = Math.floor((video.videoWidth - sourceSize) / 2);
    const sourceY = Math.floor((video.videoHeight - sourceSize) / 2);
    canvas.width = 480;
    canvas.height = 480;
    canvas.getContext("2d")?.drawImage(video, sourceX, sourceY, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);
    setCapturedWithBiometricQuality(Boolean(assessment?.ready));
    setCapturedImage(canvas.toDataURL("image/jpeg", 0.9));
  };
  const confirmCapture = (enrollBiometric: boolean) => {
    if (!capturedImage) return;
    onCapture(capturedImage, { enrollBiometric });
    closeDialog();
  };
  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    onFileSelect(event.target.files?.[0]);
    event.target.value = "";
    closeDialog();
  };

  return <div className="patient-photo-control">
    <div className="patient-photo-avatar">
      {image && failedImage !== image
        ? <Image unoptimized src={image} alt="Fotografía del paciente" width={96} height={96} onError={() => setFailedImage(image)} />
        : <span className="patient-photo-fallback" role="img" aria-label="Paciente sin fotografía">{patientInitials(patientName)}</span>}
    </div>
    <Button type="button" outlined icon="pi pi-camera" label="Tomar nueva foto" onClick={openDialog} />
    <Dialog header="Tomar foto del paciente" visible={dialogOpen} modal className="patient-photo-dialog" onHide={closeDialog}>
      <div className="patient-photo-camera">
        {capturedImage
          ? <Image unoptimized src={capturedImage} alt="Vista previa de la nueva fotografía" width={480} height={480} />
          : <div className="patient-photo-video-frame">
            <video ref={videoRef} aria-label="Vista previa de la cámara" autoPlay muted playsInline onLoadedMetadata={() => setCameraReady(true)} />
            <div className={`patient-photo-face-guide ${assessment?.ready ? "ready" : ""}`} aria-hidden="true" />
            {assessment?.face && assessment.image_width > 0 && <svg className="patient-photo-face-overlay" viewBox={`0 0 ${assessment.image_width} ${assessment.image_height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g transform={`translate(${assessment.image_width} 0) scale(-1 1)`}><rect className={assessment.ready ? "ready" : "tracking"} x={assessment.face.x} y={assessment.face.y} width={assessment.face.width} height={assessment.face.height} rx="16" /></g></svg>}
          </div>}
        {!capturedImage && !cameraError && <p role="status" className={`patient-photo-assessment ${assessment?.ready ? "ready" : ""}`}><i className={`pi ${assessment?.ready ? "pi-check-circle" : "pi-user"}`} aria-hidden="true" /> {assessment?.message ?? (assessmentError || "Buscando un rostro…")}</p>}
        {cameraError && <p role="alert" className="warning-banner">{cameraError}</p>}
      </div>
      <div className="patient-photo-dialog-actions">
        <label className="patient-photo-file-button">
          <i className="pi pi-upload" aria-hidden="true" /> Seleccionar imagen
          <input aria-label="Seleccionar fotografía del paciente" type="file" accept="image/*" capture="user" onChange={choosePhoto} />
        </label>
        {capturedImage
          ? <><Button type="button" text label="Repetir" icon="pi pi-refresh" onClick={retryCapture} /><Button type="button" outlined label="Usar solo como foto" icon="pi pi-image" onClick={() => confirmCapture(false)} />{capturedWithBiometricQuality && <Button type="button" label="Usar y registrar biometría" icon="pi pi-shield" onClick={() => confirmCapture(true)} />}</>
          : <Button type="button" label={assessment?.ready ? "Capturar" : assessmentError ? "Capturar solo fotografía" : "Ajuste el rostro"} icon="pi pi-camera" disabled={Boolean(cameraError) || (!assessment?.ready && !assessmentError)} onClick={captureFrame} />}
      </div>
      <p className="patient-photo-privacy-note"><i className="pi pi-lock" aria-hidden="true" /> La fotografía clínica y la plantilla biométrica se guardan por separado. El enrolamiento biométrico sólo ocurre al elegirlo expresamente.</p>
    </Dialog>
  </div>;
}
