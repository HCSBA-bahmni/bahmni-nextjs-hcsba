import { describe, expect, it } from "vitest";
import { buildWardBedListRows, compareWardListValues, configuredWardListHeadings } from "./wardList";
import type { Bed } from "./types";

function bed(overrides: Partial<Bed>): Bed {
  return {
    bedId: 1,
    bedUuid: "bed-1",
    bedNumber: "A-1",
    status: "AVAILABLE",
    rowNumber: 1,
    columnNumber: 1,
    location: "Sala A",
    bedTagMaps: [],
    patients: [],
    ...overrides,
  };
}

describe("ward bed list", () => {
  it("always returns every physical bed with its operational state", () => {
    const rows = buildWardBedListRows([
      bed({ bedId: 1, bedNumber: "A-1" }),
      bed({
        bedId: 2,
        bedNumber: "A-2",
        status: "OCCUPIED",
        patient: { uuid: "patient-2", name: "Ana Pérez", identifier: "RUN-2" },
        patients: [{ uuid: "patient-2", name: "Ana Pérez", identifier: "RUN-2" }],
        bedTagMaps: [{ uuid: "map", bedTag: { uuid: "tag", name: "Aislamiento" } }],
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ bedNumber: "A-1", statusLabel: "Disponible", patientName: "" });
    expect(rows[1]).toMatchObject({ bedNumber: "A-2", statusLabel: "Ocupada", patientName: "Ana Pérez", identifier: "RUN-2", tags: "Aislamiento" });
  });

  it("enriches an occupied bed with configured SQL fields without depending on them", () => {
    const rows = buildWardBedListRows([
      bed({ bedId: 2, status: "OCCUPIED", patient: { uuid: "patient-2", identifier: "RUN-2" }, patients: [] }),
    ], [{ patientUuid: "patient-2", diagnosis: "Neumonía" }]);

    expect(rows[0]?.configured).toEqual({ patientUuid: "patient-2", diagnosis: "Neumonía" });
  });

  it("filters internal configured headings and keeps empty values at the end", () => {
    expect(configuredWardListHeadings([
      { uuid: "patient", diagnosis: "A", custom: "B" },
      { patientUuid: "patient", diagnosis: "C", newColumn: "D" },
    ], ["custom"])).toEqual(["diagnosis", "newColumn"]);
    expect(compareWardListValues("", "A")).toBe(1);
    expect(compareWardListValues("10", "2")).toBeGreaterThan(0);
  });
});
