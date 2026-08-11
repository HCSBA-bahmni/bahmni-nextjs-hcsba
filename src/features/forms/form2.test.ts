import { describe, expect, it } from "vitest";
import { applyKnownFormAdapters, buildFormObservations, form2CodedControlStyle, form2DefinitionSchema, groupForm2ControlsByRows, isForm2ControlHidden, validateForm2Control } from "./form2";

const definition = form2DefinitionSchema.parse({ name: "Registration Details", uuid: "form", version: "1", controls: [{ type: "section", id: 1, label: { value: "Datos" }, controls: [
  { type: "obsControl", id: 5, label: { value: "Height" }, concept: { uuid: "height", name: "Height (cm)", datatype: "Numeric", answers: [] } },
  { type: "obsControl", id: 4, label: { value: "Weight" }, concept: { uuid: "weight", name: "Weight (kg)", datatype: "Numeric", answers: [] } },
  { type: "obsControl", id: 21, label: { value: "BMI" }, concept: { uuid: "bmi", name: "Body mass index", datatype: "Numeric", answers: [] } },
  { type: "obsControl", id: 23, label: { value: "Status" }, concept: { uuid: "status", name: "BMI Status", datatype: "Coded", answers: [{ uuid: "normal", name: { name: "Normal" } }] } },
] }] });

describe("typed Form 2 adapter", () => {
  it("accepts legacy OpenMRS metadata variants without discarding the form", () => {
    const parsed = form2DefinitionSchema.parse({ name: "Legacy", uuid: "legacy", controls: [{
      type: "obsControl", id: 1, label: { value: "Pressure", translationKey: null }, properties: { mandatory: "true", abnormal: "false" },
      lowNormal: "90", hiNormal: "140", lowAbsolute: null, description: null,
      concept: { uuid: "pressure", name: { name: "Pressure" }, datatype: { name: "Numeric" }, dataType: null, conceptClass: { name: "Question" }, properties: { allowDecimal: "false" }, description: null, answers: null },
    }] });
    expect(parsed.controls[0]).toMatchObject({ properties: { mandatory: true, abnormal: false }, lowNormal: 90, hiNormal: 140, concept: { name: "Pressure", datatype: "Numeric", conceptClass: "Question", properties: { allowDecimal: false }, answers: [] } });
  });
  it("normalizes the direct static-label shape emitted by Form Builder", () => {
    const parsed = form2DefinitionSchema.parse({ name: "History and Examination", uuid: "history", controls: [{
      type: "label", id: 23, value: "Choose Other generic", translationKey: "LABEL_23", properties: { location: { row: 0, column: 0 } },
    }] });
    expect(parsed.controls[0]).toMatchObject({ type: "label", label: { value: "Choose Other generic", translationKey: "LABEL_23" } });
  });
  it("preserves the legacy coded-control display selected in Form Builder", () => {
    const coded = (properties: Record<string, unknown>) => form2DefinitionSchema.parse({ name: "Choices", uuid: "choices", controls: [{
      type: "obsControl", id: 1, label: "Choice", properties,
      concept: { uuid: "coded", name: "Choice", datatype: "Coded", answers: [{ uuid: "a", name: "A" }] },
    }] }).controls[0]!;

    expect(form2CodedControlStyle(coded({}))).toBe("buttonSelect");
    expect(form2CodedControlStyle(coded({ dropDown: "true" }))).toBe("dropdown");
    expect(form2CodedControlStyle(coded({ autocomplete: "true" }))).toBe("autocomplete");
    expect(form2CodedControlStyle(coded({ multiSelect: "true" }))).toBe("multiSelect");
  });
  it("replaces the configured remote BMI script with a known TypeScript adapter", () => expect(applyKnownFormAdapters(definition, { "5": 170, "4": 70 })).toMatchObject({ "21": 24.22, "23": "normal" }));
  it("keeps the complete Bahmni wire concept, namespace and field path", () => expect(buildFormObservations(definition, { "5": 170 })[0]).toMatchObject({ concept: { uuid: "height", name: "Height (cm)", dataType: "Numeric" }, value: 170, formNamespace: "Bahmni", formFieldPath: "Registration Details.1/5-0", voided: false, inactive: false }));
  it("preserves observation UUIDs when editing an existing form", () => expect(buildFormObservations(definition, { "5": 171 }, [{ uuid: "existing-height", concept: { uuid: "height" }, value: 170, formFieldPath: "Registration Details.1/5-0", groupMembers: [] }])[0]).toMatchObject({ uuid: "existing-height", value: 171 }));
  it("voids an existing observation when its value is cleared", () => expect(buildFormObservations(definition, { "5": "" }, [{ uuid: "existing-height", concept: { uuid: "height" }, value: 170, formFieldPath: "Registration Details.1/5-0", groupMembers: [] }])[0]).toMatchObject({ uuid: "existing-height", voided: true }));
  it("uses legacy non-nested child paths and derives the abnormal group member", () => {
    const grouped = form2DefinitionSchema.parse({ name: "Registration Details", uuid: "grouped", version: "1", controls: [{ type: "obsGroupControl", id: 24, label: { value: "Blood Pressure" }, properties: { abnormal: true }, concept: { uuid: "bp", name: "Blood Pressure", datatype: "N/A", answers: [] }, controls: [
      { type: "obsControl", id: 25, label: { value: "Systolic" }, lowNormal: 90, hiNormal: 140, concept: { uuid: "systolic", name: "Systolic", datatype: "Numeric", answers: [] } },
      { type: "obsControl", id: 27, label: { value: "Abnormal" }, properties: { hidden: true }, concept: { uuid: "abnormal", name: "Abnormal", datatype: "Boolean", conceptClass: "Abnormal", answers: [] } },
    ] }] });
    expect(buildFormObservations(grouped, { "25": 160 })[0]).toMatchObject({ formFieldPath: "Registration Details.1/24-0", groupMembers: [
      { formFieldPath: "Registration Details.1/25-0", value: 160 },
      { formFieldPath: "Registration Details.1/27-0", value: true },
    ] });
  });
  it("ports mandatory, decimal, normal and absolute range validation", () => {
    const control = form2DefinitionSchema.parse({ name: "x", uuid: "x", controls: [{ type: "obsControl", id: 1, label: { value: "x" }, properties: { mandatory: true }, lowNormal: 10, hiNormal: 20, lowAbsolute: 5, hiAbsolute: 30, concept: { uuid: "n", name: "n", datatype: "Numeric", properties: { allowDecimal: false }, answers: [] } }] }).controls[0]!;
    expect(validateForm2Control(control, "").map((issue) => issue.code)).toEqual(["mandatory"]);
    expect(validateForm2Control(control, 25.5).map((issue) => issue.code)).toEqual(["allowDecimal", "allowRange"]);
    expect(validateForm2Control(control, 35).map((issue) => issue.code)).toEqual(["minMaxRange", "allowRange"]);
  });
  it("does not execute scripts embedded in the form definition", () => expect(Object.keys(applyKnownFormAdapters({ ...definition, name: "Unknown", events: { onFormInit: "throw new Error('remote')" } }, { "5": 170 }))).toEqual(["5"]));
  it("preserves the Form Builder row and column layout", () => {
    const controls = form2DefinitionSchema.parse({ name: "Grid", uuid: "grid", controls: [
      { type: "obsControl", id: 3, label: "Third", properties: { location: { row: 1, column: 0 } }, concept: { uuid: "3", name: "Third", datatype: "Text" } },
      { type: "obsControl", id: 2, label: "Right", properties: { location: { row: 0, column: 1 } }, concept: { uuid: "2", name: "Right", datatype: "Text" } },
      { type: "obsControl", id: 1, label: "Left", properties: { location: { row: 0, column: 0 } }, concept: { uuid: "1", name: "Left", datatype: "Text" } },
    ] }).controls;
    expect(groupForm2ControlsByRows(controls).map((row) => ({ row: row.row, columns: row.columns, ids: row.controls.map(({ control }) => control.id) }))).toEqual([
      { row: 0, columns: 2, ids: ["1", "2"] },
      { row: 1, columns: 1, ids: ["3"] },
    ]);
  });
  it("ports the allow-listed Registration Details onFormInit visibility without evaluating JavaScript", () => {
    expect(isForm2ControlHidden(definition, definition.controls[0]!.controls[2]!)).toBe(true);
    expect(isForm2ControlHidden(definition, definition.controls[0]!.controls[0]!)).toBe(false);
  });
  it("preserves indexed Form Builder addMore groups and their nested member paths", () => {
    const repeated = form2DefinitionSchema.parse({ name: "History and Examination", uuid: "history", version: "3", controls: [{
      type: "obsGroupControl", id: 25, label: { value: "Chief Complaint Record" }, properties: { addMore: true },
      concept: { uuid: "group", name: "Chief Complaint Record", datatype: "N/A" }, controls: [{
        type: "obsControl", id: 26, label: { value: "Chief Complaint" }, concept: { uuid: "complaint", name: "Chief Complaint", datatype: "Text" },
      }],
    }] });
    expect(buildFormObservations(repeated, { "25-0/26-0": "Dolor", "25-1/26-0": "Fiebre" })).toEqual([
      expect.objectContaining({ formFieldPath: "History and Examination.3/25-0", groupMembers: [expect.objectContaining({ formFieldPath: "History and Examination.3/25-0/26-0", value: "Dolor" })] }),
      expect.objectContaining({ formFieldPath: "History and Examination.3/25-1", groupMembers: [expect.objectContaining({ formFieldPath: "History and Examination.3/25-1/26-0", value: "Fiebre" })] }),
    ]);
  });
  it("uses the legacy Complex observation delete marker without persisting the marker", () => {
    const media = form2DefinitionSchema.parse({ name: "History and Examination", uuid: "history", version: "1", controls: [{
      type: "obsControl", id: 10, label: { value: "Image" }, concept: { uuid: "image", name: "Image", datatype: "Complex", conceptHandler: "ImageUrlHandler" },
    }] });
    expect(buildFormObservations(media, { "10": "patient/image.jpgvoided" })[0]).toMatchObject({ value: "patient/image.jpg", voided: true });
  });
});
