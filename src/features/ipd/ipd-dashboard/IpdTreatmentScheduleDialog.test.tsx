import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DrugOrderRow } from "@/features/clinical/drugOrders";
import { IpdTreatmentScheduleDialog } from "./IpdTreatmentScheduleDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }),
}));

const order: DrugOrderRow = {
  uuid: "order-1",
  name: "Paracetamol 500 mg",
  dose: "1 Comprimido",
  doseValue: 1,
  doseUnit: "Comprimido",
  quantity: "40 Comprimidos",
  route: "Oral",
  frequency: "Twice a day",
  drugForm: "",
  duration: "20 Days",
  durationValue: 20,
  durationUnit: "Days",
  startDate: "2026-08-04T20:00:00Z",
  scheduledDate: "2026-08-04T20:00:00Z",
  instructions: "As directed",
  additionalInstructions: "Con agua",
  rate: 2,
  additives: "Diluyente",
  provider: "Super Man",
  providerUuid: "provider-1",
  active: true,
  status: "",
  stopReason: "",
  asNeeded: false,
  immediately: false,
  emergency: false,
  medicationAdministrationStarted: false,
  durationCount: 20,
  orderNumber: 1,
  raw: {},
};

describe("IPD treatment schedule dialog parity", () => {
  it("renders the legacy clinical fields with PrimeReact calendars instead of native time inputs", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const { container } = render(<QueryClientProvider client={client}><IpdTreatmentScheduleDialog
      patientUuid="patient"
      currentProvider={null}
      order={order}
      action={{ kind: "add", label: "Programar", disabled: false }}
      config={{
        enable24HourTimers: true,
        drugChartStartTimeFrequencies: [],
        drugChartScheduleFrequencies: [{ name: "Twice a day", frequencyPerDay: 2, scheduleTiming: ["06:00", "18:00"] }],
        timeInMinutesToDisableSlotPostScheduledTime: 60,
      }}
      onHide={() => undefined}
      onSaved={() => undefined}
    /></QueryClientProvider>);

    expect(screen.getByLabelText("Medicamento")).toHaveValue("Paracetamol 500 mg");
    expect(screen.getByLabelText("Indicación")).toHaveValue("As directed");
    expect(screen.getByLabelText("Indicación adicional")).toHaveValue("Con agua");
    expect(screen.getByLabelText("Velocidad (ml/h)")).toHaveValue("2");
    expect(screen.getByLabelText("Aditivos")).toHaveValue("Diluyente");
    expect(container.querySelector('input[type="time"]')).not.toBeInTheDocument();
    expect(document.querySelectorAll(".p-calendar").length).toBeGreaterThanOrEqual(4);
  });
});
