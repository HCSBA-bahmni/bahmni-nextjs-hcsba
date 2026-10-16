import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppointmentForm } from "./AppointmentForm";

const fixture = vi.hoisted(() => ({
  config: { maxAppointmentProviders: 2, recurrence: { defaultNumberOfOccurrences: 2 } },
  providers: [{ uuid: "qa-a", name: "Proveedor A" }, { uuid: "qa-b", name: "Proveedor B" }, { uuid: "qa-c", name: "Proveedor C" }],
  privileges: [{ name: "app:appointments" }, { name: "app:appointments:manageAppointmentsTab" }],
  router: { isReady: true, query: {} },
}));
vi.mock("next/router", () => ({ useRouter: () => fixture.router }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ user: { privileges: fixture.privileges }, provider: { uuid: "qa-session-provider" } }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isLoading: false,
    data: queryKey[1] === "config" ? fixture.config : queryKey[1] === "providers" ? fixture.providers : queryKey[1] === "detail" ? undefined : [],
  }),
}));

describe("AppointmentForm provider selector", () => {
  it("starts empty rather than selecting the session provider UUID", async () => {
    const { container } = render(<AppointmentForm embedded />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(container.querySelector(".appointment-provider-select .p-multiselect-label")).toHaveTextContent("Seleccionar proveedores");
    expect(container).not.toHaveTextContent("qa-session-provider");
  });

  it("retains a provider explicitly selected from a calendar resource", async () => {
    const { container } = render(<AppointmentForm embedded initialSlot={{ start: new Date(2026, 9, 16, 9), end: new Date(2026, 9, 16, 10), providerUuid: "qa-a" }} />);
    await waitFor(() => expect(container.querySelector(".appointment-provider-select .p-multiselect-label")).toHaveTextContent("Proveedor A"));
  });

  it("opens a multiple dropdown, preserves the configured limit and permits deselection", async () => {
    const { container } = render(<AppointmentForm embedded />);
    expect(container.querySelector("select[multiple]")).toBeNull();
    fireEvent.click(container.querySelector(".appointment-provider-select")!);
    const options = within(document.querySelector<HTMLElement>(".appointment-provider-options")!);
    fireEvent.click(await options.findByText("Proveedor A"));
    fireEvent.click(options.getByText("Proveedor B"));
    expect(screen.getByText("2 proveedores seleccionados")).toBeInTheDocument();
    fireEvent.click(options.getByText("Proveedor C"));
    expect(screen.getByText("2 proveedores seleccionados")).toBeInTheDocument();
    fireEvent.click(options.getByText("Proveedor A"));
    expect(container.querySelector(".appointment-provider-select .p-multiselect-label")).toHaveTextContent("Proveedor B");
    fireEvent.click(options.getByText("Proveedor C"));
    expect(screen.getByText("2 proveedores seleccionados")).toBeInTheDocument();
    const selected = screen.getByRole("list", { name: "Proveedores seleccionados" });
    expect(within(selected).getAllByRole("listitem")).toHaveLength(2);
    expect(selected).toHaveTextContent("Proveedor B");
    expect(selected).toHaveTextContent("Proveedor C");
    fireEvent.click(within(selected).getByRole("button", { name: "Quitar Proveedor B" }));
    expect(within(selected).getAllByRole("listitem")).toHaveLength(1);
    expect(container.querySelector(".appointment-provider-select .p-multiselect-label")).toHaveTextContent("Proveedor C");
  });
});
