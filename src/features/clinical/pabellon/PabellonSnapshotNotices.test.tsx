import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PabellonItem } from "@/services/bahmni/pabellon";
import { PabellonSnapshotNotices, snapshotNotices } from "./PabellonSnapshotNotices";
const item = (warningCodes: string[], schedules?: unknown) => ({ warningCodes, request: schedules === undefined ? null : { schedulesAtSnapshot: schedules } }) as Pick<PabellonItem, "warningCodes" | "request">;
describe("Snapshot notice explanations", () => {
  it("does not present historic state as missing clinical data", () => {
    const notices = snapshotNotices(item(["STATE_AND_SCHEDULE_ARE_HISTORICAL", "OPERATIONAL_SNAPSHOT_NOT_TRACKED"]));
    expect(notices.every(notice => notice.kind === "info")).toBe(true);
    expect(notices[1]?.text).toContain("sin captura de seguimiento");
  });
  it("does not infer unscheduled current state from missing snapshot schedules", () => {
    const notices = snapshotNotices(item(["SNAPSHOT_SCHEDULE_UNAVAILABLE"]));
    expect(notices[0]?.text).toContain("No permite concluir");
    expect(notices.some(notice => notice.text === "Sin programación registrada en esta snapshot.")).toBe(false);
  });
  it("reports an explicitly empty schedule only as snapshot information", () => {
    expect(snapshotNotices(item([], []))).toEqual([{ kind: "info", text: "Sin programación registrada en esta snapshot." }]);
    expect(snapshotNotices(item([], null))).toEqual([]);
  });
  it("distinguishes unavailable and invalid snapshots and version conflicts", () => {
    const notices = snapshotNotices(item(["REQUEST_SNAPSHOT_UNAVAILABLE", "REQUEST_SNAPSHOT_INVALID", "REQUEST_SNAPSHOT_MULTIPLE_LATEST"]));
    expect(notices.every(notice => notice.kind === "review")).toBe(true);
    expect(new Set(notices.map(notice => notice.text)).size).toBe(3);
  });
  it("preserves unrecognized warnings without exposing arbitrary text", () => {
    expect(snapshotNotices(item(["NEW_WARNING"]))[0]?.text).toContain("NEW_WARNING");
    expect(snapshotNotices(item(["private unexpected content"]))[0]?.text).not.toContain("private");
  });
  it("deduplicates codes and renders a reason without the old blanket warning", () => {
    const data = item(["SNAPSHOT_PATIENT_UNAVAILABLE", "SNAPSHOT_PATIENT_UNAVAILABLE"]);
    expect(snapshotNotices(data)).toHaveLength(1);
    render(<PabellonSnapshotNotices item={data} />);
    expect(screen.getByLabelText("Información de la snapshot")).toHaveTextContent("Datos del paciente no incluidos");
    expect(screen.queryByText("Información histórica incompleta")).not.toBeInTheDocument();
    expect(screen.getByText(/esperar no completa/)).toBeInTheDocument();
  });
});
