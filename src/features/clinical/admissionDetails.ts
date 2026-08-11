export interface AdmissionEvent {
  date?: string;
  notes?: string;
  provider?: string;
}

export interface AdmissionDetailsModel {
  ward?: string;
  bed?: string;
  admission?: AdmissionEvent;
  discharge?: AdmissionEvent;
  daysAdmitted?: number;
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value : undefined;

const event = (value: unknown): AdmissionEvent | undefined => {
  const item = object(value);
  if (!Object.keys(item).length) return undefined;
  return {
    date: text(item.date ?? item.encounterDateTime),
    notes: text(item.notes),
    provider: text(item.provider),
  };
};

export function normalizeAdmissionDetails(visitSummary: unknown, assignedBed: unknown): AdmissionDetailsModel {
  const summary = object(visitSummary);
  const assignedRoot = object(assignedBed);
  const bedValue = Array.isArray(assignedBed)
    ? assignedBed[0]
    : Array.isArray(assignedRoot.results)
      ? assignedRoot.results[0]
      : assignedBed;
  const bed = object(bedValue);
  const nestedBed = object(bed.bed);
  const physicalLocation = object(bed.physicalLocation);
  const parentLocation = object(physicalLocation.parentLocation);
  const admissionLocation = object(bed.admissionLocation);
  const admission = event(summary.admissionDetails);
  const discharge = event(summary.dischargeDetails);
  let daysAdmitted: number | undefined;
  if (admission?.date && discharge?.date) {
    const start = new Date(admission.date).getTime();
    const stop = new Date(discharge.date).getTime();
    if (Number.isFinite(start) && Number.isFinite(stop) && stop >= start) daysAdmitted = Math.ceil((stop - start) / 86_400_000);
  }
  return {
    ward: text(bed.wardName ?? bed.admissionLocationName ?? admissionLocation.display ?? admissionLocation.name ?? parentLocation.display ?? parentLocation.name),
    bed: text(bed.bedNumber ?? nestedBed.display ?? bed.display),
    admission,
    discharge,
    daysAdmitted,
  };
}
