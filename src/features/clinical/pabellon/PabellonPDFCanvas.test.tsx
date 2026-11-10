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
  it("zooms in/out, resets to 100 percent and preserves zoom when paging", async () => {
    const fixture = source(); render(<PabellonPDFCanvas blob={blob} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "100 %" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "100 %" }));
    await waitFor(() => expect(screen.getByLabelText("Zoom del PDF")).toHaveTextContent("100 %"));
    expect(screen.getByRole("img")).toHaveStyle({ width: "612px", maxWidth: "none" });
    fireEvent.click(screen.getByRole("button", { name: "Acercar PDF" }));
    await waitFor(() => expect(screen.getByLabelText("Zoom del PDF")).toHaveTextContent("125 %"));
    expect(screen.getByRole("img")).toHaveStyle({ width: "765px" });
    fireEvent.click(screen.getByRole("button", { name: "Alejar PDF" }));
    await waitFor(() => expect(screen.getByLabelText("Zoom del PDF")).toHaveTextContent("100 %"));
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(screen.getByRole("img", { name: "Página 2 del PDF del protocolo" })).toHaveStyle({ width: "612px" }));
    expect(mock.getDocument).toHaveBeenCalledTimes(1); expect(fixture.document.getPage).toHaveBeenLastCalledWith(2);
  });
  it("fits the whole page or available width and indicates the active mode", async () => {
    source(); render(<PabellonPDFCanvas blob={blob} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ajustar al ancho" })).toBeEnabled());
    const full = screen.getByRole("button", { name: "Página completa" });
    expect(full).toHaveAttribute("aria-pressed", "true");
    const originalWidth = parseFloat((screen.getByRole("img") as HTMLCanvasElement).style.width);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar al ancho" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ajustar al ancho" })).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(parseFloat((screen.getByRole("img") as HTMLCanvasElement).style.width)).toBeGreaterThan(originalWidth));
    await waitFor(() => expect(full).toBeEnabled()); fireEvent.click(full);
    await waitFor(() => expect(full).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(parseFloat((screen.getByRole("img") as HTMLCanvasElement).style.width)).toBeCloseTo(originalWidth));
  });
  it("ends the loader if rerendering after zoom fails", async () => {
    const fixture = source(); render(<PabellonPDFCanvas blob={blob} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Acercar PDF" })).toBeEnabled());
    fixture.page.render.mockImplementation(() => ({ promise: Promise.reject(new Error("PRIVATE_ERROR")), cancel: fixture.cancel }));
    fireEvent.click(screen.getByRole("button", { name: "Acercar PDF" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("PRIVATE_ERROR");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  beforeEach(() => { vi.resetAllMocks(); vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D); });
  it("renders verified bytes locally, with bounded canvas and local worker", async () => {
    const fixture = source(); const view = render(<PabellonPDFCanvas blob={blob} />);
    const canvas = await screen.findByRole("img", { name: "Página 1 del PDF del protocolo" });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(mock.getDocument).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Uint8Array), useWorkerFetch: false, useWasm: false }));
    expect(mock.options.workerSrc).toContain("pdf.worker.min.mjs");
    expect(mock.getDocument.mock.calls[0]![0]).not.toHaveProperty("url");
    expect((canvas as HTMLCanvasElement).width).toBeLessThanOrEqual(4096);
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
  it("opens in a dedicated tall dialog and can be reopened without fetching again", async () => {
    source(); render(<PabellonPDFCanvas blob={blob} />);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog")).toHaveStyle({ height: "94dvh" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Abrir visor PDF" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mock.getDocument).toHaveBeenCalledTimes(1);
  });
});
