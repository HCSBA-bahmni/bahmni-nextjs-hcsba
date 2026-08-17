import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAssignedBed } from "@/services/bahmni/ipd";
import { AssignedBedBadge } from "./AssignedBedBadge";

vi.mock("@/services/bahmni/ipd", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/bahmni/ipd")>();
  return { ...original, getAssignedBed: vi.fn() };
});

const mockedGetAssignedBed = vi.mocked(getAssignedBed);

function renderBadge(showAdmittedWithoutBed = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><AssignedBedBadge patientUuid="patient-uuid" showAdmittedWithoutBed={showAdmittedWithoutBed} /></QueryClientProvider>);
  return { ...result, client };
}

describe("AssignedBedBadge", () => {
  beforeEach(() => mockedGetAssignedBed.mockReset());

  it("shows the marker only after OpenMRS confirms the assigned bed", async () => {
    mockedGetAssignedBed.mockResolvedValue({ bedNumber: "CXI-S-1-2", bedId: 12 });

    renderBadge();

    expect(screen.queryByLabelText(/Cama asignada/)).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Cama asignada: CXI-S-1-2")).toBeInTheDocument();
    expect(mockedGetAssignedBed).toHaveBeenCalledWith("patient-uuid");
  });

  it("does not show the marker when the patient has no assigned bed", async () => {
    mockedGetAssignedBed.mockResolvedValue(null);

    renderBadge();

    await waitFor(() => expect(mockedGetAssignedBed).toHaveBeenCalledWith("patient-uuid"));
    expect(screen.queryByLabelText(/Cama asignada/)).not.toBeInTheDocument();
  });

  it("distinguishes an admitted patient who has no current bed", async () => {
    mockedGetAssignedBed.mockResolvedValue(null);

    renderBadge(true);

    expect(await screen.findByText("Admitido sin cama")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Cama asignada/)).not.toBeInTheDocument();
  });

});
