import { describe, expect, it } from "vitest";
import type { Form2Observation } from "@/features/forms/form2";
import { buildRegistrationEncounterPayload, toEncounterWireObservations } from "./visits";

describe("toEncounterWireObservations", () => {
  it("matches the minimal recursive concept contract sent by Angular", () => {
    const observations: Form2Observation[] = [{
      concept: { uuid: "blood-pressure", name: "Blood Pressure", dataType: "N/A" },
      formNamespace: "Bahmni",
      formFieldPath: "Registration Details.1/24-0",
      groupMembers: [{
        concept: { uuid: "systolic", name: "Systolic", dataType: "Numeric" },
        value: 120,
        groupMembers: [],
        formNamespace: "Bahmni",
        formFieldPath: "Registration Details.1/25-0",
        voided: false,
        inactive: false,
      }],
      voided: false,
      inactive: false,
    }];

    expect(toEncounterWireObservations(observations)).toEqual([{
      concept: { uuid: "blood-pressure", name: "Blood Pressure" },
      formNamespace: "Bahmni",
      formFieldPath: "Registration Details.1/24-0",
      groupMembers: [{
        concept: { uuid: "systolic", name: "Systolic" },
        value: 120,
        groupMembers: [],
        formNamespace: "Bahmni",
        formFieldPath: "Registration Details.1/25-0",
        voided: false,
        inactive: false,
      }],
      voided: false,
      inactive: false,
    }]);
  });

  it("sends the active visit type required by the HCSBA encounter backend", () => {
    expect(buildRegistrationEncounterPayload({
      patientUuid: "patient",
      locationUuid: "location",
      encounterTypeUuid: "REG",
      visitTypeUuid: "OPD",
      providerUuid: "provider",
    })).toMatchObject({
      patientUuid: "patient",
      locationUuid: "location",
      encounterTypeUuid: "REG",
      visitTypeUuid: "OPD",
      providers: [{ uuid: "provider" }],
      observations: [],
    });
  });
});
