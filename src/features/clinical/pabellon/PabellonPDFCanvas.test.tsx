import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PabellonPDFCanvas } from "./PabellonPDFCanvas";
const mock = vi.hoisted(() => ({ getDocument: vi.fn(), options: { workerSrc: "" } }));
vi.mock("pdfjs-dist", () => ({ getDocument: mock.getDocument, GlobalWorkerOptions: mock.options }));
const blob = { arrayBuffer: async () => new TextEncoder().encode("%PDF-FIXTURE_ONLY").buffer } as Blob;
function source(pages = 3) {
  const cancel = vi.fn(); const destroy = vi.fn();
  const page = { getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }), render: vi.fn(() => ({ promise: Promise.resolve(), cancel })) };
  const document = { numPages: pages, getPage: vi.fn(async () => page) };
  mock.getDocument.mockReturnValue({ promise: Promise.resolve(document), destroy });
  return { document, page, cancel, destroy };
}
describe("local verified PDF canvas", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D); });
  it("renders verified bytes locally, with bounded canvas and local worker", async () => {
    const fixture = source(); const view = render(<PabellonPDFCanvas blob={blob} />);
    const canvas = await screen.findByRole("img", { name: "Página 1 del PDF del protocolo" });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(mock.getDocument).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Uint8Array), useWorkerFetch: false, useWasm: false }));
    expect(mock.options.workerSrc).toContain("pdf.worker.min.mjs");
    expect(mock.getDocument.mock.calls[0]![0]).not.toHaveProperty("url");
    expect((canvas as HTMLCanvasElement).width).toBeLessThanOrEqual(1350);
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    expect(fixture.page.render).toHaveBeenCalledWith(expect.objectContaining({ annotationMode: 0 })); view.unmount(); expect(fixture.destroy).toHaveBeenCalledTimes(1);
  });
  it("paginates one canvas without requesting the PDF again", async () => {
    const fixture = source(); render(<PabellonPDFCanvas blob={blob} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Página siguiente" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(fixture.document.getPage).toHaveBeenLastCalledWith(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Página anterior" })).toBeEnabled());
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument(); expect(mock.getDocument).toHaveBeenCalledTimes(1);
  });
  it("ends the loader and hides the canvas on render error, without leaking details", async () => {
    const fixture = source(); fixture.page.render.mockImplementation(() => ({ promise: Promise.reject(new Error("PRIVATE_ERROR")), cancel: fixture.cancel }));
    render(<PabellonPDFCanvas blob={blob} />); const error = await screen.findByRole("alert");
    expect(error).not.toHaveTextContent("PRIVATE_ERROR"); expect(screen.queryByRole("status")).not.toBeInTheDocument(); expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("destroys loading task on close, even while parsing", async () => {
    const destroy = vi.fn(); mock.getDocument.mockReturnValue({ promise: new Promise(() => {}), destroy });
    const view = render(<PabellonPDFCanvas blob={blob} />); await waitFor(() => expect(mock.getDocument).toHaveBeenCalledTimes(1)); view.unmount(); expect(destroy).toHaveBeenCalledTimes(1);
  });
  it("rejects an excessive page count and releases resources", async () => {
    const fixture = source(201); const view = render(<PabellonPDFCanvas blob={blob} />); await screen.findByRole("alert"); expect(fixture.document.getPage).not.toHaveBeenCalled(); view.unmount(); expect(fixture.destroy).toHaveBeenCalledTimes(1);
  });
});
