import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BiometricCandidateList } from "./BiometricPatientSearch";

describe("BiometricCandidateList", () => {
  it("shows ordered candidates and leaves selection to the operator", () => {
    const onOpen = vi.fn();
    render(<BiometricCandidateList threshold={.363} onOpen={onOpen} candidates={[{ mpi_id: "p1", template_id: "9ca37da1-8432-4d90-b295-59a92b980485", similarity: .718, model: "opencv-sface:2021dec", created_at: "2026-09-16T12:00:00Z", patient: { uuid: "p1", identifier: "RUN-1", givenName: "Ana", familyName: "Pérez" } }]} />);
    expect(screen.getByText("Ana Pérez")).toBeVisible();
    expect(screen.getByText("71.8%")).toBeVisible();
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar perfil" }));
    expect(onOpen).toHaveBeenCalledWith("p1");
  });
});
