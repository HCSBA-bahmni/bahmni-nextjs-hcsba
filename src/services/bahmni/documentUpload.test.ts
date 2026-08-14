import { afterEach, describe, expect, it, vi } from "vitest";
import { attachDocumentUploadFiles, documentFileType, getDocumentUploadConcepts, saveVisitDocument } from "./documentUpload";
import type { Visit } from "@/types/bahmni";

afterEach(() => vi.unstubAllGlobals());

describe("document upload service", () => {
  it("loads document type concepts using the legacy fully specified name search", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        uuid: "top",
        setMembers: [
          { uuid: "angio", name: { name: "Angiografia" } },
          { uuid: "ct", name: { name: "Tomografia computarizada" } },
        ],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const concepts = await getDocumentUploadConcepts("All Radiology orders");
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");

    expect(url.pathname).toBe("/openmrs/ws/rest/v1/concept");
    expect(url.searchParams.get("s")).toBe("byFullySpecifiedName");
    expect(url.searchParams.get("name")).toBe("All Radiology orders");
    expect(concepts).toEqual([
      { uuid: "angio", name: "Angiografia", display: "Angiografia" },
      { uuid: "ct", name: "Tomografia computarizada", display: "Tomografia computarizada" },
    ]);
  });

  it("attaches legacy encounter document obs to their visit", () => {
    const visits = [
      { uuid: "visit-old", startDatetime: "2025-07-14T10:00:00.000-0400" },
      { uuid: "visit-new", startDatetime: "2025-08-14T09:00:00.000-0400" },
    ] as Visit[];
    const encounters = [
      {
        uuid: "encounter-1",
        provider: { uuid: "provider-1", display: "Superman" },
        visit: { uuid: "visit-old" },
        obs: [{
          uuid: "obs-1",
          concept: { uuid: "concept-1", name: { name: "Radiografia" } },
          groupMembers: [
            { id: 2, uuid: "member-2", obsDatetime: "2025-07-14T11:00:00.000-0400", value: "image-b.png", comment: "perfil" },
            { id: 1, uuid: "member-1", obsDatetime: "2025-07-14T10:30:00.000-0400", value: "image-a.png" },
          ],
        }],
      },
    ];

    const result = attachDocumentUploadFiles(visits, encounters);

    expect(result.map((visit) => visit.uuid)).toEqual(["visit-new", "visit-old"]);
    expect(result[0]?.files).toEqual([]);
    expect(result[1]?.files).toEqual([
      expect.objectContaining({
        id: "1",
        encodedValue: "/document_images/image-a.png",
        obsUuid: "obs-1",
        encounterUuid: "encounter-1",
        concept: { uuid: "concept-1", name: "Radiografia", editableName: "Radiografia" },
      }),
      expect.objectContaining({
        id: "2",
        encodedValue: "/document_images/image-b.png",
        comment: "perfil",
        provider: { uuid: "provider-1", display: "Superman" },
      }),
    ]);
  });

  it("classifies the file types accepted by the legacy upload endpoint", () => {
    expect(documentFileType("application/pdf")).toBe("pdf");
    expect(documentFileType("image/jpeg")).toBe("image");
    expect(documentFileType("text/plain")).toBe("not_supported");
  });

  it("deletes voided document files before saving the visit document payload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ encounterUuid: "encounter-1" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await saveVisitDocument({
      patientUuid: "patient-1",
      visitTypeUuid: "visit-type-1",
      encounterTypeUuid: "encounter-type-1",
      documents: [{ testUuid: "concept-1", image: "image-a.png", obsUuid: "obs-1", voided: true }],
    });

    const deleteUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    const postUrl = new URL(String(fetchMock.mock.calls[1]?.[0]), "https://hcsba.local");

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
    expect(deleteUrl.pathname).toBe("/openmrs/ws/rest/v1/bahmnicore/visitDocument");
    expect(deleteUrl.searchParams.get("filename")).toBe("image-a.png");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(postUrl.pathname).toBe("/openmrs/ws/rest/v1/bahmnicore/visitDocument");
  });
});
