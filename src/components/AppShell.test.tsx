import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/AuthContext";
import { AppShell } from "./AppShell";

vi.mock("@/features/auth/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/features/auth/authMode", () => ({ isKeycloakAuth: () => false }));

afterEach(cleanup);

describe("application navigation by OpenMRS privileges", () => {
  it.each([
    { privileges: ["app:registration"], links: ["Inicio", "Registro"] },
    { privileges: ["app:clinical"], links: ["Inicio", "Clínico"] },
    { privileges: ["app:registration", "app:clinical", "app:appointments", "app:adt"], links: ["Inicio", "Registro", "Clínico", "Citas", "Camas"] },
    { privileges: [], links: ["Inicio"] },
  ])("shows only authorized links for $privileges", ({ privileges, links }) => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uuid: "demo-user", username: "demo.registro", roles: [], privileges: privileges.map((name) => ({ name })) },
      location: { uuid: "location-1", display: "HCSBA" },
      quickLogoutComboKey: "Escape", signOut: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    render(<AppShell>Contenido</AppShell>);
    const navigation = within(screen.getByRole("navigation", { name: "Navegación principal" }));
    expect(navigation.getAllByRole("link").map((link) => link.textContent)).toEqual(links);
    expect(screen.getByRole("button", { name: "Salir" })).toBeVisible();
    expect(screen.getByRole("link", { name: "HCSBA" })).toHaveAttribute("href", "/location");
  });
});
