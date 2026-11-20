import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PabellonItem } from "@/services/bahmni/pabellon";
import { renderRequestPDF } from "./requestPdfFromSnapshot";
import { PabellonRequestPDF } from "./PabellonRequestPDF";
vi.mock("./requestPdfFromSnapshot", () => ({ renderRequestPDF: vi.fn() }));
vi.mock("./PabellonPDFCanvas", () => ({ PabellonPDFCanvas: () => <p>PDF PREVIEW</p> }));
const item = { id: "1", request: { requestNumber: "QA", sections: [{}], catalogueSelections: {} }, requestSnapshot: { version: 1 } } as unknown as PabellonItem;
describe("Request PDF preview", () => {
  beforeEach(() => { vi.resetAllMocks(); URL.createObjectURL = vi.fn(() => "blob:qa"); URL.revokeObjectURL = vi.fn(); });
  it("single-flights generation and ends loading after failure", async () => {
    let reject!: (error: Error) => void; vi.mocked(renderRequestPDF).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    render(<PabellonRequestPDF item={item} />); const button = screen.getByRole("button", { name: /Vista previa/ }); fireEvent.click(button); fireEvent.click(button);
    expect(renderRequestPDF).toHaveBeenCalledTimes(1); expect(button).toBeDisabled(); reject(new Error("QA ERROR"));
    expect(await screen.findByRole("alert")).toHaveTextContent("QA ERROR"); await waitFor(() => expect(button).toBeEnabled());
  });
  it("previews before offering download and releases object URL", async () => {
    vi.mocked(renderRequestPDF).mockResolvedValue(new Blob(["%PDF-QA"], { type: "application/pdf" })); const view = render(<PabellonRequestPDF item={item} />);
    expect(screen.queryByRole("link", { name: "Descargar PDF" })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: /Vista previa/ }));
    expect(await screen.findByText("PDF PREVIEW")).toBeInTheDocument(); expect(screen.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute("href", "blob:qa"); view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qa");
  });
});
