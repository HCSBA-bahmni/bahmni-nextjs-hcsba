import { describe, expect, it } from "vitest";
import { consultationBoardsForPrivileges, durationUnitForFrequency, formVisibleForVisit, parseConsultationAppConfig, parseConsultationBoards, parseConsultationForms, parseMedicationConfig } from "./config";

describe("consultation config compatibility", () => {
  it("keeps legacy order and source order for ties", () => {
    const boards = parseConsultationBoards([
      { id: "treatment", extensionPointId: "org.bahmni.clinical.consultation.board", url: "treatment", label: "Treatment", order: 7 },
      { id: "bacteriology", extensionPointId: "org.bahmni.clinical.consultation.board", url: "bacteriology", label: "Bacteriology", order: 7 },
      { id: "diagnosis", extensionPointId: "org.bahmni.clinical.consultation.board", url: "diagnosis", label: "Diagnosis", order: 2 },
    ]);
    expect(boards.map((board) => board.slug)).toEqual(["diagnosis", "treatment", "bacteriology"]);
  });

  it("parses configured forms without executing showIf JavaScript", () => {
    const forms = parseConsultationForms([{ id: "vitals", extensionPointId: "org.bahmni.clinical.conceptSetGroup.observations", order: 1, extensionParams: { formName: "Vitals", showIf: ["var visitTypes = ['OPD'];"] } }]);
    expect(forms[0]?.visitTypes).toEqual(["OPD"]);
    expect(formVisibleForVisit(forms[0]!, "IPD")).toBe(false);
  });

  it("uses safe legacy defaults", () => {
    expect(parseConsultationAppConfig({ config: {} }).defaultVisitType).toBe("OPD");
    expect(parseMedicationConfig({}).defaultDurationUnit).toBe("Days");
  });

  it("filters boards consistently for three privilege profiles", () => {
    const configured = parseConsultationBoards([
      { id: "observations", extensionPointId: "org.bahmni.clinical.consultation.board", url: "concept-set-group/observations", label: "Observations", order: 1 },
      { id: "diagnosis", extensionPointId: "org.bahmni.clinical.consultation.board", url: "diagnosis", label: "Diagnosis", order: 2, requiredPrivilege: "app:clinical:diagnosis" },
      { id: "treatment", extensionPointId: "org.bahmni.clinical.consultation.board", url: "treatment", label: "Treatment", order: 3, requiredPrivilege: ["app:clinical:treatment", "app:clinical:prescribe"] },
    ]);
    expect(consultationBoardsForPrivileges(configured, ["app:clinical"]).map((board) => board.slug)).toEqual(["observations"]);
    expect(consultationBoardsForPrivileges(configured, ["app:clinical", "app:clinical:diagnosis"]).map((board) => board.slug)).toEqual(["observations", "diagnosis"]);
    expect(consultationBoardsForPrivileges(configured, ["app:clinical", "app:clinical:diagnosis", "app:clinical:treatment", "app:clinical:prescribe"]).map((board) => board.slug)).toEqual(["observations", "diagnosis", "treatment"]);
  });

  it("maps frequency ranges without evaluating configuration JavaScript", () => {
    const config = parseMedicationConfig({ tabConfig: { allMedicationTabConfig: { inputOptionsConfig: {
      defaultDurationUnit: "Days",
      frequencyDefaultDurationUnitsMap: [
        { minFrequency: "1/7", maxFrequency: 5, defaultDurationUnit: "Days" },
        { minFrequency: "1/30", maxFrequency: "1/7", defaultDurationUnit: "Weeks" },
        { minFrequency: null, maxFrequency: "1/30", defaultDurationUnit: "Months" },
      ],
    } } } });
    expect(durationUnitForFrequency(config, 2)).toBe("Days");
    expect(durationUnitForFrequency(config, 0.1)).toBe("Weeks");
    expect(durationUnitForFrequency(config, 0.02)).toBe("Months");
  });

  it("parses legacy automatic duration rules and their known plural alias", () => {
    const singular = parseMedicationConfig({ tabConfig: { allMedicationTabConfig: { inputOptionsConfig: { autopopulateDurationBasedOnFrequency: [{ frequencyName: "Once daily", duration: 5, durationUnit: "Days" }] } } } });
    const plural = parseMedicationConfig({ tabConfig: { allMedicationTabConfig: { inputOptionsConfig: { autopopulateDurationsBasedOnFrequency: [{ frequencyName: "Weekly", duration: 4, durationUnit: "Weeks" }] } } } });
    expect(singular.autopopulateDurationBasedOnFrequency).toEqual([{ frequencyName: "Once daily", duration: 5, durationUnit: "Days" }]);
    expect(plural.autopopulateDurationBasedOnFrequency).toEqual([{ frequencyName: "Weekly", duration: 4, durationUnit: "Weeks" }]);
  });
});
