import { describe, expect, it } from "vitest";
import { ipsSectionKey, selectIpsSections } from "./IpsDashboard";

describe("IPS dashboard configuration", () => {
  it("maps FHIR section titles to the HCSBA Spanish configuration keys", () => {
    expect(ipsSectionKey({ title: "Immunizations" })).toBe("vacunas");
    expect(ipsSectionKey({ title: "Alergías e intolerancias" })).toBe("alergias");
    expect(ipsSectionKey({ title: "Medication summary" })).toBe("medicamentos");
  });

  it("keeps only the sections explicitly enabled by showSections", () => {
    expect(selectIpsSections([{ title: "Vacunas" }, { title: "Alergias" }], { vacunas: true, alergias: false })).toEqual([{ title: "Vacunas" }]);
  });
});
