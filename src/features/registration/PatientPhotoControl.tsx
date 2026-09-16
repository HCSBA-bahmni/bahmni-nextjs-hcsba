import Image from "next/image";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

interface PatientPhotoControlProps {
  image?: string;
  patientName: string;
  onCapture(image: string): void;
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!dialogOpen || capturedImage) return;
    let cancelled = false;
    const stopCamera = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    if (!navigator.mediaDevices?.getUserMedia) return stopCamera;
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraError("No fue posible acceder a la cámara. Revise el permiso del navegador o seleccione una imagen."));
    return () => { cancelled = true; stopCamera(); };
  }, [capturedImage, dialogOpen]);

  const closeDialog = () => {
    setDialogOpen(false);
    setCapturedImage("");
    setCameraError("");
  };
  const openDialog = () => {
    setCameraError(typeof navigator.mediaDevices?.getUserMedia === "function" ? "" : "Este navegador no permite acceder a la cámara. Puede seleccionar una imagen desde el dispositivo.");
    setDialogOpen(true);
  };
  const retryCapture = () => {
    setCameraError("");
    setCapturedImage("");
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
    setCapturedImage(canvas.toDataURL("image/jpeg", 0.9));
  };
  const confirmCapture = () => {
    if (!capturedImage) return;
    onCapture(capturedImage);
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
          : <video ref={videoRef} aria-label="Vista previa de la cámara" autoPlay muted playsInline />}
        {cameraError && <p role="alert" className="warning-banner">{cameraError}</p>}
      </div>
      <div className="patient-photo-dialog-actions">
        <label className="patient-photo-file-button">
          <i className="pi pi-upload" aria-hidden="true" /> Seleccionar imagen
          <input aria-label="Seleccionar fotografía del paciente" type="file" accept="image/*" capture="user" onChange={choosePhoto} />
        </label>
        {capturedImage
          ? <><Button type="button" text label="Repetir" icon="pi pi-refresh" onClick={retryCapture} /><Button type="button" label="Usar esta foto" icon="pi pi-check" onClick={confirmCapture} /></>
          : <Button type="button" label="Capturar" icon="pi pi-camera" disabled={Boolean(cameraError)} onClick={captureFrame} />}
      </div>
    </Dialog>
  </div>;
}
