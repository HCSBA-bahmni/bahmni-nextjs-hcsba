import { z } from "zod";

const biometricErrorSchema = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).loose().optional(),
}).loose();

export const biometricAssessmentSchema = z.object({
  status: z.enum(["no_face", "multiple_faces", "too_far", "too_close", "off_center", "low_confidence", "ready"]),
  ready: z.boolean(),
  message: z.string(),
  face_count: z.number().int().nonnegative(),
  image_width: z.number().int().nonnegative(),
  image_height: z.number().int().nonnegative(),
  face: z.object({
    x: z.number(), y: z.number(), width: z.number(), height: z.number(), confidence: z.number(),
  }).nullable(),
});

export const biometricEnrollmentSchema = z.object({
  template_id: z.string().uuid(),
  mpi_id: z.string(),
  model: z.string(),
  quality: z.object({
    detector_confidence: z.number(),
    face_width: z.number(),
    face_height: z.number(),
    image_width: z.number(),
    image_height: z.number(),
  }),
  created_at: z.string(),
});

const biometricQualitySchema = z.object({
  detector_confidence: z.number(),
  face_width: z.number(),
  face_height: z.number(),
  image_width: z.number(),
  image_height: z.number(),
});

export const biometricSearchSchema = z.object({
  candidates: z.array(z.object({
    mpi_id: z.string(),
    template_id: z.string().uuid(),
    similarity: z.number(),
    model: z.string(),
    created_at: z.string(),
  })),
  threshold_reference: z.number(),
  decision: z.literal("human_review_required"),
  quality: biometricQualitySchema,
});

export const biometricVerificationSchema = z.object({
  mpi_id: z.string(),
  template_found: z.boolean(),
  best_template_id: z.string().uuid().nullable(),
  similarity: z.number().nullable(),
  threshold_reference: z.number(),
  above_threshold: z.boolean().nullable(),
  decision: z.literal("client_confirmation_required"),
  quality: biometricQualitySchema,
});

export type BiometricAssessment = z.infer<typeof biometricAssessmentSchema>;
export type BiometricEnrollment = z.infer<typeof biometricEnrollmentSchema>;
export type BiometricSearchResult = z.infer<typeof biometricSearchSchema>;
export type BiometricVerification = z.infer<typeof biometricVerificationSchema>;

export class BiometricApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
    this.name = "BiometricApiError";
  }
}

const biometricBase = "/biometric-api";

async function biometricRequest<T>(path: string, body: FormData, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${biometricBase}${path}`, {
    method: "POST",
    body,
    credentials: "include",
    signal,
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) {
    const error = biometricErrorSchema.safeParse(payload);
    throw new BiometricApiError(
      response.status,
      error.success ? error.data.error?.message ?? "No fue posible procesar la biometría facial." : "No fue posible procesar la biometría facial.",
      error.success ? error.data.error?.code : undefined,
    );
  }
  return schema.parse(payload);
}

export function assessBiometricFrame(image: Blob, signal?: AbortSignal): Promise<BiometricAssessment> {
  const form = new FormData();
  form.append("image", image, "camera-preview.jpg");
  return biometricRequest("/biometric/assess", form, biometricAssessmentSchema, signal);
}

export function patientPhotoDataUrlToBlob(image: string): Blob {
  const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error("La fotografía no tiene un formato biométrico compatible.");
  const bytes = Uint8Array.from(atob(match[2]!), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

export function enrollPatientBiometrics(patientUuid: string, image: string): Promise<BiometricEnrollment> {
  const form = new FormData();
  form.append("mpi_id", patientUuid);
  form.append("image", patientPhotoDataUrlToBlob(image), "patient.jpg");
  return biometricRequest("/biometric/enroll", form, biometricEnrollmentSchema);
}

export function searchPatientBiometrics(image: string, topK = 5): Promise<BiometricSearchResult> {
  const form = new FormData();
  form.append("top_k", String(topK));
  form.append("image", patientPhotoDataUrlToBlob(image), "patient-search.jpg");
  return biometricRequest("/biometric/search", form, biometricSearchSchema);
}

export function verifyPatientBiometrics(patientUuid: string, image: string): Promise<BiometricVerification> {
  const form = new FormData();
  form.append("mpi_id", patientUuid);
  form.append("image", patientPhotoDataUrlToBlob(image), "patient-verification.jpg");
  return biometricRequest("/biometric/verify", form, biometricVerificationSchema);
}
