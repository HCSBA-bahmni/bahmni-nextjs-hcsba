import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PabellonRequestFields } from "./PabellonRequestFields";
import { emptyPabellonClinicalDraft } from "./pabellonClinicalDraft";
vi.mock("./PabellonCataloguePicker", () => ({ PabellonCataloguePicker: ({ label }: { label: string }) => <div data-testid="catalogue">{label}</div> }));
function Form() {
  const [value, setValue] = useState(emptyPabellonClinicalDraft());
  return <PabellonRequestFields scopeKey="qa:patient" value={value} onChange={setValue} />;
}
function answer(label: string, answer: "Sí" | "No") {
  fireEvent.click(within(screen.getByRole("group", { name: label + " *" })).getByRole("button", { name: answer }));
}
describe("Pabellón clinical fields", () => {
  it("starts duration at zero and allows direct typing without a clock picker", () => {
    render(<Form />);
    const input = screen.getByLabelText("Duración estimada (HH:mm) *");
    expect(input).toHaveValue("00:00");
    fireEvent.change(input, { target: { value: "01:30" } });
    expect(input).toHaveValue("01:30");
    fireEvent.change(input, { target: { value: "00:45" } });
    expect(input).toHaveValue("00:45");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    expect(input.closest(".p-calendar")).toBeNull();
  });
  it("shows the complete supplies section but never enables kits or Sofya writes", () => {
    render(<Form />);
    const region = screen.getByRole("region",{name:"Insumos y equipos médicos"});
    expect(within(region).getByLabelText("Solicitar equipos médicos")).toBeEnabled();
    expect(within(region).getByLabelText("Insumos opcionales")).toBeEnabled();
    expect(within(region).getByText(/bloqueados por indicación/)).toBeInTheDocument();
    expect(region.querySelector(".p-multiselect")).toHaveClass("p-disabled");
  });
  it("distinguishes affirmative and negative selected states without preselecting answers", () => {
    render(<Form />); const group = screen.getByRole("group", { name: "¿Paciente oncológico? *" });
    expect(group).toHaveAttribute("data-answer", "unset");
    answer("¿Paciente oncológico?", "Sí"); expect(group).toHaveAttribute("data-answer", "yes");
    answer("¿Paciente oncológico?", "No"); expect(group).toHaveAttribute("data-answer", "no");
  });
  it("keeps the native section order and explicit biopsy, blood and bed decisions", () => {
    render(<Form />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((item) => item.textContent?.trim())).toEqual(["Datos del paciente", "Evaluación preoperatoria", "Programación cirugía", "Biopsia", "Necesidad producto sanguíneo", "Insumos y equipos médicos", "Prioridad y salida"]);
    expect(screen.queryByText("Tipo de biopsia")).not.toBeInTheDocument();
    answer("Biopsia", "Sí"); expect(screen.getByText("Tipo de biopsia")).toBeInTheDocument();
    answer("Biopsia", "No"); expect(screen.queryByText("Tipo de biopsia")).not.toBeInTheDocument();
    answer("Producto sanguíneo", "Sí"); expect(screen.getByLabelText("Descripción *")).toBeInTheDocument();
    answer("Producto sanguíneo", "No"); expect(screen.queryByLabelText("Descripción *")).not.toBeInTheDocument();
    answer("¿Requiere cama de salida?", "Sí"); expect(screen.getByText("Condiciones de prioridad (opcional)")).toBeInTheDocument();
    expect(screen.queryByText("Prioridad de cama de salida")).not.toBeInTheDocument();
    expect(screen.queryByText("Prioridad de la solicitud")).not.toBeInTheDocument();
  });
  it("preserves the hospitalization flow, with admission service always present", () => {
    render(<Form />);
    expect(screen.queryByRole("group", { name: /Requiere hospitalización/ })).not.toBeInTheDocument();
    expect(screen.getByText("Servicio de ingreso")).toBeInTheDocument();
    answer("¿Paciente hospitalizado?", "No");
    answer("¿Requiere hospitalización previa?", "Sí");
    expect(screen.getByText("Días de hospitalización previa")).toBeInTheDocument();
    expect(screen.getByLabelText("Motivo de hospitalización previa *")).toBeInTheDocument();
    answer("¿Requiere hospitalización previa?", "No");
    expect(screen.queryByText("Días de hospitalización previa")).not.toBeInTheDocument();
    expect(screen.getByText("Servicio de ingreso")).toBeInTheDocument();
    answer("¿Paciente hospitalizado?", "Sí");
    expect(screen.queryByRole("group", { name: /Requiere hospitalización/ })).not.toBeInTheDocument();
    expect(screen.getByText("Servicio de ingreso")).toBeInTheDocument();
  });
  it("keeps only assessments, ASA and location in evaluation, and surgery data in programming", () => {
    render(<Form />);
    const evaluation = screen.getByRole("region", { name: "Evaluación preoperatoria" });
    expect(within(evaluation).getByText("Evaluaciones preoperatorias")).toBeInTheDocument();
    expect(within(evaluation).getByText("ASA")).toBeInTheDocument();
    expect(within(evaluation).getByText("Ubicación de cirugía")).toBeInTheDocument();
    expect(within(evaluation).queryByText("Especialidad")).not.toBeInTheDocument();
    const programming = screen.getByRole("region", { name: "Programación cirugía" });
    expect(within(programming).getByText("Especialidad")).toBeInTheDocument();
    expect(within(programming).getByLabelText("Duración estimada (HH:mm) *")).toBeInTheDocument();
    expect(within(programming).getByText("Plan quirúrgico — código MAI y prestación")).toBeInTheDocument();
  });
  it("shows bilateral laterality only when required, with native clinical cards and no send action", () => {
    render(<Form />); answer("¿Tiene lateralidad?", "Sí");
    expect(screen.getByLabelText("Lateralidad *")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Evaluación preoperatoria" })).toHaveClass("clinical-card");
    expect(screen.getByText("Plan quirúrgico — código MAI y prestación")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registrar|Enviar/i })).not.toBeInTheDocument();
  });
});
