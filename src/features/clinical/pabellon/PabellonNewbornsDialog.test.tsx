import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PabellonItem } from "@/services/bahmni/pabellon";
import { PabellonNewbornsDialog } from "./PabellonNewbornsDialog";
describe("Newborn consultation only", () => {
  it("keeps false/zero/nullable values and never offers writing or PDF", () => {
    const item = { id: "1", request: null, newborns: { contentSource: "native-newborn-module", eligible: true, observedAt: "2026-11-05T12:00:00Z", records: [{ id: "1", bornAt: "2026-11-05 08:00:00", alive: false, sex: "Mujer", weightGrams: 3000, heightCM: 48, apgar1: 0, apgar5: 7, apgar10: null, placentaStudy: false, placentaWeight: null, observation: "QA OBS" }] } } as PabellonItem;
    render(<PabellonNewbornsDialog item={item} onHide={() => {}} />);
    expect(screen.getByText("Fallecido(a)")).toBeInTheDocument(); expect(screen.getByText("0")).toBeInTheDocument(); expect(screen.getByText("QA OBS")).toBeInTheDocument();
    expect(screen.queryByText("APGAR minuto 10")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Guardar|Registrar|Editar|PDF|Descargar/i })).not.toBeInTheDocument();
  });
});
