import { describe, expect, it } from "vitest";
import { comparisonState, documentOverlap, reviewDocuments } from "./mpiIdentityComparison";
const mapping = [{ name: "Pasaporte", teiTypeCode: "05" }, { name: "RUN", teiTypeCode: "01", issuerCountryCode: "152" }];
const doc = (country: string) => ({ identifier: [{ value: "P001", type: { coding: [{ code: "05" }], extension: [{ url: "x/CodigoPaises", valueCodeableConcept: { coding: [{ code: country }] } }] } }] });
describe("MPI comparison evidence", () => {
  it("does not claim the same passport when countries differ or are missing", () => {
    const entered = reviewDocuments(doc("604"), mapping);
    expect(documentOverlap(entered, reviewDocuments(doc("152"), mapping))).toEqual([]);
    expect(documentOverlap(reviewDocuments(doc(""), mapping), reviewDocuments(doc(""), mapping))).toEqual([]);
    expect(documentOverlap(entered, reviewDocuments(doc("604"), mapping))).toHaveLength(1);
  });
  it("deduplicates indexed and typed documents, ignoring internal MPI identifiers", () => {
    expect(reviewDocuments({ identifier: [...doc("604").identifier,
      { system: "urn:hcsba:mpi:document:05", value: "604:P001" },
      { system: "urn:hcsba:mpi:ficha-emr:225", value: "internal-uuid" }] }, mapping)).toHaveLength(1);
  });
  it("normalizes RUN formatting only for the display comparison", () => {
    const a = reviewDocuments({ identifier: [{ type: { coding: [{ code: "01" }] }, value: "12.345.678-5" }] }, mapping);
    const b = reviewDocuments({ identifier: [{ system: "http://clientregistry.org/nationalid", value: "12345678-5" }] }, mapping);
    expect(documentOverlap(a, b)).toHaveLength(1);
  });
  it("uses indexed domains over stale annotations and never labels internal identifiers as documents", () => {
    const result = reviewDocuments({ identifier: [
      { system: "http://clientregistry.org/nationalid", value: "12345678-5", type: { coding: [{ code: "05" }] } },
      { system: "urn:hcsba:mpi:identificador-clinico:225", value: "P001", type: { coding: [{ code: "05" }] } },
    ] }, mapping);
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("RUN");
  });
  it("keeps absent demographics distinct from mismatching data", () => {
    expect(comparisonState("1990-01-02", undefined)).toBe("unknown");
    expect(comparisonState("1990-01-02", "1990-02-01")).toBe("different");
  });
});
