import { describe, expect, it } from "vitest";
import { formatLatestObservationDate, groupLatestObservations } from "./registrationLatest";

describe("registration latest observations", () => {
  it("flattens grouped observations, filters configured concepts and keeps newest groups first", () => {
    const groups = groupLatestObservations([{
      observationDateTime: "2026-08-03T14:26:00.000-04:00",
      groupMembers: [
        { concept: { name: "Weight (kg)", units: "kg" }, value: 100 },
        { concept: { name: "BMI Status" }, value: { displayString: "Morbid Obesity" } },
        { concept: { name: "Not configured" }, value: "ignored" },
      ],
    }], ["Weight (kg)", "BMI Status"]);
    expect(groups).toEqual([{ dateTime: "2026-08-03T14:26:00.000-04:00", items: [
      { label: "Weight (kg)", value: "100 kg" },
      { label: "BMI Status", value: "Morbid Obesity" },
    ] }]);
  });
  it("formats a server date for the HCSBA locale", () => expect(formatLatestObservationDate("2026-08-03T14:26:00.000-04:00")).toContain("2026"));
});
