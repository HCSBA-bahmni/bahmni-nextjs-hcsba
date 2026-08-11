import { describe, expect, it } from "vitest";
import {
  canAddDiagnosisAsCondition,
  conditionName,
  conditionFromDiagnosis,
  conditionsByStatus,
  mergeConsultationCondition,
  primaryDiagnosisFirst,
  qualifyTerminologyConcept,
} from "./diagnosisBoard";
import type { ConsultationCondition, ConsultationDiagnosis } from "./types";

const condition = (overrides: Partial<ConsultationCondition> = {}): ConsultationCondition => ({
  clientId: "condition", concept: { uuid: "asthma", name: "Asma" }, status: "ACTIVE", ...overrides,
});

describe("legacy consultation diagnosis board rules", () => {
  it("uses the localized short condition name before the fully specified name", () => {
    expect(conditionName(condition({ concept: {
      uuid: "931e5b35-08e9-4fa4-9210-0a7557609b5e",
      name: "Large tonsils (finding)",
      shortName: "amÃ­gdalas grandes",
    } }))).toBe("amÃ­gdalas grandes");
  });

  it("qualifies terminology concept codes exactly once for condition writes", () => {
    const concept = { uuid: "420662003", name: "Coma diabético", conceptSystem: "http://snomed.info/sct" };
    expect(qualifyTerminologyConcept(concept)?.uuid).toBe("http://snomed.info/sct/420662003");
    expect(qualifyTerminologyConcept({ ...concept, uuid: "http://snomed.info/sct/420662003" })?.uuid).toBe("http://snomed.info/sct/420662003");
  });
  it("groups conditions into active, history-of and inactive lists", () => {
    const conditions = [condition(), condition({ clientId: "history", status: "HISTORY_OF" }), condition({ clientId: "inactive", status: "INACTIVE" })];
    expect(conditionsByStatus(conditions, "ACTIVE").map((item) => item.clientId)).toEqual(["condition"]);
    expect(conditionsByStatus(conditions, "HISTORY_OF").map((item) => item.clientId)).toEqual(["history"]);
    expect(conditionsByStatus(conditions, "INACTIVE").map((item) => item.clientId)).toEqual(["inactive"]);
  });

  it("rejects an existing active condition and reactivates an inactive condition in place", () => {
    const active = condition({ uuid: "active-condition" });
    expect(mergeConsultationCondition([active], condition({ clientId: "candidate" }), "2026-08-04")).toMatchObject({ error: "already-active", conditions: [active] });

    const inactive = condition({ uuid: "inactive-condition", status: "INACTIVE", activeSince: "2025-01-01", onSetDate: "2026-01-01" });
    const result = mergeConsultationCondition([inactive], condition({ clientId: "candidate", onSetDate: "2026-08-04", additionalDetail: "control" }), "2026-08-04");
    expect(result.error).toBeUndefined();
    expect(result.conditions[0]).toMatchObject({ uuid: "inactive-condition", status: "ACTIVE", onSetDate: "2026-08-04", additionalDetail: "control", dirty: true });
  });

  it("does not reactivate a condition before its original active date", () => {
    const inactive = condition({ uuid: "inactive-condition", status: "INACTIVE", activeSince: "2026-06-01" });
    const result = mergeConsultationCondition([inactive], condition({ clientId: "candidate", onSetDate: "2026-05-31" }), "2026-08-04");
    expect(result.error).toBe("date-before-active");
  });

  it("only converts confirmed diagnoses without an active duplicate", () => {
    const diagnosis: ConsultationDiagnosis = { clientId: "diagnosis", codedAnswer: { uuid: "asthma", name: "Asma" }, order: "PRIMARY", certainty: "CONFIRMED", comments: "control" };
    expect(canAddDiagnosisAsCondition(diagnosis, [])).toBe(true);
    expect(conditionFromDiagnosis(diagnosis, "new-condition", "2026-08-04")).toMatchObject({ concept: diagnosis.codedAnswer, status: "ACTIVE", onSetDate: "2026-08-04", additionalDetail: "control" });
    expect(canAddDiagnosisAsCondition(diagnosis, [condition()])).toBe(false);
    expect(canAddDiagnosisAsCondition({ ...diagnosis, certainty: "PRESUMED" }, [])).toBe(false);
  });

  it("orders primary diagnoses before secondary diagnoses", () => {
    const diagnoses: ConsultationDiagnosis[] = [
      { clientId: "secondary", order: "SECONDARY", certainty: "CONFIRMED" },
      { clientId: "primary", order: "PRIMARY", certainty: "CONFIRMED" },
    ];
    expect(primaryDiagnosisFirst(diagnoses).map((item) => item.clientId)).toEqual(["primary", "secondary"]);
  });
});
