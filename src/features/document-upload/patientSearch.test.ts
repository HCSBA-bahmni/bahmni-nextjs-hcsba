import { describe, expect, it } from "vitest";
import { documentUploadPatientDestination, filterDocumentUploadPatients, parseDocumentUploadSearchTabs } from "./patientSearch";
import type { AppExtension, BahmniUser, PatientSearchResult } from "@/types/bahmni";

const user = { uuid: "user", privileges: [{ uuid: "radiology", name: "app:radiology-upload" }], roles: [] } as BahmniUser;
const patientDocumentsUser = { uuid: "user", privileges: [{ uuid: "patient-documents", name: "app:patient-documents" }], roles: [] } as BahmniUser;

const extensions: AppExtension[] = [
  {
    id: "active",
    extensionPointId: "org.bahmni.patient.search",
    type: "config",
    label: "Active Patients",
    requiredPrivilege: "app:radiology-upload",
    order: 1,
    extensionParams: {
      searchHandler: "emrapi.sqlSearch.activePatients",
      translationKey: "MODULE_LABEL_ACTIVE_PATIENTS_KEY",
      forwardUrl: "#/patient/{{patientUuid}}/document",
    },
  },
  {
    id: "all",
    extensionPointId: "org.bahmni.patient.search",
    type: "config",
    label: "All patients",
    requiredPrivilege: "app:radiology-upload",
    order: 2,
    extensionParams: {
      translationKey: "MODULE_LABEL_ALL_PATIENTS_KEY",
      forwardUrl: "#/patient/{{patientUuid}}/document",
    },
  },
];

describe("document upload patient search", () => {
  it("parses radiology upload search tabs from legacy extensions", () => {
    expect(parseDocumentUploadSearchTabs(extensions, user)).toEqual([
      expect.objectContaining({ id: "active", handler: "emrapi.sqlSearch.activePatients", translationKey: "MODULE_LABEL_ACTIVE_PATIENTS_KEY" }),
      expect.objectContaining({ id: "all", handler: undefined, translationKey: "MODULE_LABEL_ALL_PATIENTS_KEY" }),
    ]);
  });

  it("can reuse the shared legacy patient search tabs with a document context privilege", () => {
    expect(parseDocumentUploadSearchTabs(extensions, patientDocumentsUser, "app:patient-documents")).toEqual([
      expect.objectContaining({ id: "active", handler: "emrapi.sqlSearch.activePatients" }),
      expect.objectContaining({ id: "all", handler: undefined }),
    ]);
    expect(parseDocumentUploadSearchTabs(extensions, patientDocumentsUser)).toEqual([]);
  });

  it("filters patients by display, name or identifier", () => {
    const patients = [
      { uuid: "p1", display: "Matias Santis - RUN*1272K1", identifier: "RUN*1272K1" },
      { uuid: "p2", name: "Natalia Jara", identifier: "RUT*15530220-8" },
    ] as PatientSearchResult[];
    expect(filterDocumentUploadPatients(patients, "jara")).toEqual([patients[1]]);
    expect(filterDocumentUploadPatients(patients, "1272")).toEqual([patients[0]]);
  });

  it("keeps the legacy document upload forward route and query context", () => {
    const [tab] = parseDocumentUploadSearchTabs(extensions, user);
    expect(documentUploadPatientDestination(tab!, { uuid: "patient-uuid" } as PatientSearchResult, { encounterType: "RADIOLOGY", topLevelConcept: "All Radiology orders" }))
      .toBe("/document-upload?encounterType=RADIOLOGY&topLevelConcept=All+Radiology+orders#/patient/patient-uuid/document");
  });
});
