import { describe, expect, it } from "vitest";
import { applyConceptSetUiConfig, validateKnownFormEvents } from "./formAdapters";
import type { Form2Definition } from "@/features/forms/form2";

describe("consultation Form2 adapters", () => {
  it("does not execute or accept unknown remote event scripts", () => {
    const definition = { uuid: "x", name: "Unknown", version: "1", controls: [], events: { onFormSave: "throw new Error('remote')" } } as unknown as Form2Definition;
    expect(validateKnownFormEvents(definition, {})).toEqual([]);
  });
  it("ports declarative conceptSetUI and ignores scripts", () => {
    const definition = { uuid: "x", name: "Vitals", version: "1", controls: [{ id: "1", type: "obsControl", label: { value: "Posture" }, properties: {}, concept: { uuid: "c", name: "Posture", datatype: "Coded", answers: [] }, controls: [] }] } as unknown as Form2Definition;
    const configured = applyConceptSetUiConfig(definition, { Posture: { buttonSelect: true, showIf: "alert(1)" } });
    expect(configured.controls[0]?.properties.dropDown).toBe(false);
    expect(configured.controls[0]?.properties).not.toHaveProperty("showIf");
  });
  it("normalizes the legacy dropdown alias without changing the Form Builder default", () => {
    const definition = { uuid: "x", name: "Vitals", version: "1", controls: [{ id: "1", type: "obsControl", label: { value: "Posture" }, properties: {}, concept: { uuid: "c", name: "Posture", datatype: "Coded", answers: [] }, controls: [] }] } as unknown as Form2Definition;
    expect(applyConceptSetUiConfig(definition, { Posture: { dropdown: true } }).controls[0]?.properties).toMatchObject({ dropDown: true });
    expect(applyConceptSetUiConfig(definition, {}).controls[0]?.properties).not.toHaveProperty("dropDown");
  });
  it("uses the legacy chief-complaint concept mapping and configured duration rule", () => {
    const definition = {
      uuid: "history", name: "History and Examination", version: "1", controls: [{
        id: "group", type: "obsGroupControl", label: { value: "Chief Complaint Data" }, properties: {},
        concept: { uuid: "group-concept", name: "Chief Complaint Data", datatype: "N/A", answers: [] },
        controls: [
          { id: "complaint", type: "obsControl", label: { value: "Complaint" }, properties: {}, concept: { uuid: "coded", name: "Chief Complaint", datatype: "Coded", answers: [{ uuid: "other", name: "Other generic" }] }, controls: [] },
          { id: "free", type: "obsControl", label: { value: "Free text" }, properties: {}, concept: { uuid: "free", name: "Non-Coded Chief Complaint", datatype: "Text", answers: [] }, controls: [] },
          { id: "duration", type: "obsControl", label: { value: "Duration" }, properties: {}, concept: { uuid: "duration", name: "Complaint Duration", datatype: "Numeric", conceptClass: "Duration", answers: [] }, controls: [] },
          { id: "unit", type: "obsControl", label: { value: "Unit" }, properties: {}, concept: { uuid: "unit", name: "Duration Unit", datatype: "Coded", answers: [] }, controls: [] },
        ],
      }],
    } as unknown as Form2Definition;
    const configured = applyConceptSetUiConfig(definition, { "Chief Complaint Data": { autocomplete: true, codedConceptName: "Chief Complaint", nonCodedConceptName: "Non-Coded Chief Complaint", durationRequired: true, onValueChanged: "remote()" } });

    expect(configured.controls[0]?.properties).toMatchObject({ autoComplete: true, codedConceptName: "Chief Complaint", nonCodedConceptName: "Non-Coded Chief Complaint", durationRequired: true });
    expect(configured.controls[0]?.properties).not.toHaveProperty("onValueChanged");
    expect(validateKnownFormEvents(configured, { complaint: "other" }).map((issue) => issue.controlId)).toEqual(["duration", "unit", "free"]);
    expect(validateKnownFormEvents(configured, { duration: 2 }).map((issue) => issue.controlId)).toEqual(["complaint"]);
  });
  it("honours the current HCSBA durationRequired false override", () => {
    const definition = {
      uuid: "history", name: "History and Examination", version: "1", controls: [{
        id: "group", type: "obsGroupControl", label: { value: "Chief Complaint Data" }, properties: {}, concept: { uuid: "group", name: "Chief Complaint Data", datatype: "N/A", answers: [] },
        controls: [{ id: "complaint", type: "obsControl", label: { value: "Complaint" }, properties: {}, concept: { uuid: "coded", name: "Chief Complaint", datatype: "Coded", answers: [{ uuid: "cough", name: "Cough" }] }, controls: [] }],
      }],
    } as unknown as Form2Definition;
    const configured = applyConceptSetUiConfig(definition, { "Chief Complaint Data": { codedConceptName: "Chief Complaint", nonCodedConceptName: "Non-Coded Chief Complaint", durationRequired: false } });
    expect(validateKnownFormEvents(configured, { complaint: "cough" })).toEqual([]);
  });
});
