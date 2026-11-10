import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PabellonSurgeonFields } from "./PabellonSurgeonFields";
import { emptyPabellonSurgeonDraft } from "./pabellonSurgeonDraft";
vi.mock("./PabellonCataloguePicker", () => ({ PabellonCataloguePicker: ({ label }: { label: string }) => <div>{label}</div> }));
function Form() { const [value, setValue] = useState(emptyPabellonSurgeonDraft()); return <PabellonSurgeonFields scopeKey="qa:actor:patient:visit" value={value} onChange={setValue} />; }
describe("HIS indicating physician fields", () => {
  it("requires an explicit mode switch before accepting a free name, then clears it", () => {
    render(<Form />);
    expect(screen.getAllByText("Médico que indica la cirugía")).toHaveLength(2);
    expect(screen.queryByLabelText("Nombre completo del médico *")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ingresar nombre" }));
    fireEvent.change(screen.getByLabelText("Nombre completo del médico *"), { target: { value: "QA MÉDICO" } });
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar médico registrado" }));
    fireEvent.click(screen.getByRole("button", { name: "Ingresar nombre" }));
    expect(screen.getByLabelText("Nombre completo del médico *")).toHaveValue("");
    expect(screen.getByText(/no crea un profesional/)).toBeInTheDocument();
  });
  it("uses native clinical cards and disables mode/name editing while pending", () => {
    const onChange = vi.fn();
    render(<PabellonSurgeonFields scopeKey="qa" value={{ mode: "manual", name: "QA", selected: null }} onChange={onChange} disabled />);
    expect(screen.getByRole("region", { name: "Médico que indica la cirugía" })).toHaveClass("clinical-card");
    expect(screen.getByLabelText("Nombre completo del médico *")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ingresar nombre" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Seleccionar médico registrado" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar médico registrado" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
