import { z } from "zod";
import { audit } from "./audit";
import { bahmniRequest, queryString } from "./http";
import type { Reference, Visit } from "@/types/bahmni";

const record = z.record(z.string(), z.unknown());
const records = z.array(record);
const results = z.object({ results: records.default([]) }).loose();

export interface DocumentUploadFile {
  id: string;
  encodedValue: string;
  obsUuid?: string;
  obsDatetime?: string | number;
  visitUuid?: string;
  encounterUuid?: string;
  concept: { uuid?: string; name: string; editableName: string };
  comment?: string;
  provider?: { uuid?: string; display?: string };
  voided?: boolean;
  new?: boolean;
}

export interface DocumentUploadVisit extends Visit {
  files: DocumentUploadFile[];
}

export interface PendingDocumentUploadFile {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  conceptUuid?: string;
  conceptName?: string;
  comment?: string;
}

export interface VisitDocumentPayload {
  patientUuid: string;
  visitTypeUuid: string;
  visitStartDate?: string | null;
  visitEndDate?: string | null;
  encounterTypeUuid: string;
  encounterDateTime?: string | null;
  providerUuid?: string;
  visitUuid?: string;
  locationUuid?: string;
  visitTypeName?: string;
  encounterTypeName?: string;
  documents: Array<{
    testUuid?: string;
    image: string;
    obsDateTime?: string | null;
    obsUuid?: string;
    voided?: boolean;
    comment?: string;
  }>;
}

export function canModifyDocumentUploadFile(file: Pick<DocumentUploadFile, "new" | "provider">, currentUserPersonUuid?: string, currentProviderUuid?: string): boolean {
  if (file.new) return true;
  const creatorUuid = file.provider?.uuid;
  if (!creatorUuid) return false;
  return creatorUuid === currentUserPersonUuid || creatorUuid === currentProviderUuid;
}

function auditMessage(message: string, params?: Record<string, unknown>): string {
  return params ? `${message}~${JSON.stringify(params)}` : message;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nestedRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(nestedRecord) : [];
}

function conceptName(concept: Record<string, unknown>): string {
  const name = nestedRecord(concept.name);
  return text(name.name) ?? text(concept.display) ?? text(concept.name) ?? "";
}

export async function getEncounterTypeUuid(encounterTypeName: string): Promise<string | undefined> {
  const config = await bahmniRequest<{ encounterTypes?: Record<string, string> }>(`/ws/rest/v1/bahmnicore/config/bahmniencounter${queryString({ callerContext: "REGISTRATION_CONCEPTS" })}`);
  return config.encounterTypes?.[encounterTypeName];
}

export async function getDocumentUploadConcepts(topLevelConcept: string): Promise<Reference[]> {
  if (!topLevelConcept) return [];
  const response = await bahmniRequest(`/ws/rest/v1/concept${queryString({ s: "byFullySpecifiedName", name: topLevelConcept, v: "custom:(uuid,setMembers:(uuid,name:(name)))" })}`, { schema: results });
  const topLevel = response.results[0];
  return nestedRecords(topLevel?.setMembers).map((concept) => ({
    uuid: String(concept.uuid ?? ""),
    name: conceptName(concept),
    display: conceptName(concept),
  })).filter((concept) => concept.uuid && concept.name);
}

export async function getDocumentUploadEncounters(patientUuid: string, encounterTypeUuid: string): Promise<Record<string, unknown>[]> {
  const response = await bahmniRequest(`/ws/rest/v1/encounter${queryString({
    patient: patientUuid,
    order: "desc",
    encounterType: encounterTypeUuid,
    v: "custom:(uuid,provider,visit:(uuid,startDatetime,stopDatetime),obs:(uuid,concept:(uuid,name),groupMembers:(id,uuid,obsDatetime,value,comment)))",
  })}`, { schema: results });
  return response.results;
}

export function attachDocumentUploadFiles(visits: Visit[], encounters: Record<string, unknown>[]): DocumentUploadVisit[] {
  return visits.map((visit) => {
    const files = encounters.flatMap((encounter) => {
      const encounterVisit = nestedRecord(encounter.visit);
      if (encounterVisit.uuid !== visit.uuid) return [];
      const provider = nestedRecord(encounter.provider);
      return nestedRecords(encounter.obs).flatMap((observation) => {
        const concept = nestedRecord(observation.concept);
        const name = conceptName(concept);
        return nestedRecords(observation.groupMembers).map((member) => ({
          id: String(member.id ?? member.uuid ?? `${encounter.uuid ?? visit.uuid}-${member.value ?? ""}`),
          encodedValue: `/document_images/${String(member.value ?? "")}`,
          obsUuid: text(observation.uuid),
          obsDatetime: text(member.obsDatetime) ?? (typeof member.obsDatetime === "number" ? member.obsDatetime : undefined),
          visitUuid: visit.uuid,
          encounterUuid: text(encounter.uuid),
          provider: { uuid: text(provider.uuid), display: text(provider.display) },
          concept: { uuid: text(concept.uuid), name, editableName: name },
          comment: text(member.comment),
        } satisfies DocumentUploadFile));
      });
    }).sort((a, b) => Number(a.id) - Number(b.id));
    return { ...visit, files };
  }).sort((a, b) => new Date(b.startDatetime).getTime() - new Date(a.startDatetime).getTime());
}

export function documentFileType(mimeType: string): "pdf" | "image" | "not_supported" {
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("image")) return "image";
  return "not_supported";
}

export async function uploadVisitDocumentFile(file: PendingDocumentUploadFile, patientUuid: string, encounterTypeName: string): Promise<string> {
  const searchStr = ";base64,";
  const fileType = documentFileType(file.mimeType);
  if (fileType === "not_supported" || !file.dataUrl.includes(searchStr)) throw new Error("Tipo de archivo no soportado.");
  const format = fileType === "pdf" ? "pdf" : file.mimeType.split("/")[1] ?? "jpeg";
  const response = await bahmniRequest<{ url?: string }>("/ws/rest/v1/bahmnicore/visitDocument/uploadDocument", {
    method: "POST",
    body: JSON.stringify({
      content: file.dataUrl.substring(file.dataUrl.indexOf(searchStr) + searchStr.length),
      format,
      patientUuid,
      encounterTypeName,
      fileType,
      fileName: file.fileName.includes(".") ? file.fileName.substring(0, file.fileName.lastIndexOf(".")) : file.fileName,
    }),
  });
  if (!response.url) throw new Error("El backend no devolvio la ruta del documento.");
  return response.url;
}

export async function saveVisitDocument(payload: VisitDocumentPayload): Promise<Record<string, unknown>> {
  await Promise.all(payload.documents.filter((document) => document.voided && document.image).map((document) => bahmniRequest(`/ws/rest/v1/bahmnicore/visitDocument${queryString({ filename: document.image })}`, { method: "DELETE" })));
  const { visitTypeName, encounterTypeName, ...documentPayload } = payload;
  const response = await bahmniRequest<Record<string, unknown>>("/ws/rest/v1/bahmnicore/visitDocument", {
    method: "POST",
    body: JSON.stringify(documentPayload),
    schema: record,
  });
  const auditModule = encounterTypeName ?? "MODULE_LABEL_HOME_KEY";
  if (!payload.visitUuid) {
    await audit("OPEN_VISIT", auditMessage("OPEN_VISIT_MESSAGE", { visitUuid: response.visitUuid, visitType: visitTypeName }), payload.patientUuid, auditModule);
  }
  await audit("EDIT_ENCOUNTER", auditMessage("EDIT_ENCOUNTER_MESSAGE", { encounterUuid: response.encounterUuid, encounterType: encounterTypeName }), payload.patientUuid, auditModule);
  return response;
}
