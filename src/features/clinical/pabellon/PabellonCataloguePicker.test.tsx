import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { getPabellonCatalogue, type PabellonCataloguePage, type PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { PabellonReadError } from "@/services/bahmni/pabellon";
import { PabellonCataloguePicker } from "./PabellonCataloguePicker";
vi.mock("@/services/bahmni/pabellonCatalogues", async (original) => ({ ...await original<typeof import("@/services/bahmni/pabellonCatalogues")>(), getPabellonCatalogue: vi.fn() }));
const item = (id = "1", group = "procedures"): PabellonCatalogueOption => ({ sourceId: id, code: "QA-" + id, display: "QA OPCIÓN " + id, system: "urn:hcsba:pabellon:catalogue:" + group, active: true, relations: [] });
const page = (items = [item()], nextCursor: string | null = null, catalogue = "procedures"): PabellonCataloguePage => ({ catalogue: catalogue as PabellonCataloguePage["catalogue"], version: "a".repeat(64), items, nextCursor, observedAt: "2026-11-02T12:00:00Z", correlationId: "11111111-1111-4111-8111-111111111111" });
type Props = React.ComponentProps<typeof PabellonCataloguePicker>;
function show(extra: Partial<Props> = {}) {
  const props: Props = { scopeKey: "actor:patient", catalogue: "procedures", label: "Prestaciones", value: [], onChange: vi.fn(), ...extra };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Form() { const [value, setValue] = useState(props.value); return <PabellonCataloguePicker {...props} value={value} onChange={(items) => { props.onChange(items); setValue(items); }} />; }
  return { ...render(<QueryClientProvider client={client}><Form /></QueryClientProvider>), props };
}
function open() { fireEvent.click(screen.getByRole("combobox")); }
describe("Pabellón PrimeReact native controls", () => {
  it("does not prepend a MAI code already contained in the original description", async () => {
    const original = { ...item(), code: "2004006", display: "2004006 - Cesárea" };
    vi.mocked(getPabellonCatalogue).mockResolvedValue(page([original]));
    show(); open(); expect(await screen.findByRole("option", { name: "2004006 - Cesárea" })).toBeInTheDocument();
    expect(screen.queryByText("2004006 — 2004006 - Cesárea")).not.toBeInTheDocument();
  });
  beforeEach(() => { vi.resetAllMocks(); vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function(this: HTMLElement) { return this.parentElement; }); });
  afterEach(() => vi.restoreAllMocks());
  it("uses a Dropdown and keeps the selected label inside, without a second selection box", async () => {
    vi.mocked(getPabellonCatalogue).mockResolvedValue(page());
    const view = show(); expect(getPabellonCatalogue).not.toHaveBeenCalled(); open();
    const option = await screen.findByRole("option", { name: "QA-1 — QA OPCIÓN 1" });
    expect(view.container).not.toContainElement(option);
    expect(document.body).toContainElement(option);
    fireEvent.click(option);
    expect(view.props.onChange).toHaveBeenCalledWith([item()]);
    expect(view.container.querySelector(".p-dropdown-label")).toHaveTextContent("QA-1 — QA OPCIÓN 1");
    expect(screen.queryByRole("list", { name: /seleccionados/ })).not.toBeInTheDocument();
  });
  it("uses MultiSelect chips inside the same field and preserves multiple original IDs", async () => {
    vi.mocked(getPabellonCatalogue).mockResolvedValue(page([item(), item("2")]));
    const view = show({ multiple: true }); open();
    const option = await screen.findByRole("option", { name: /QA-1 — QA OPCIÓN 1/ });
    expect(view.container).not.toContainElement(option);
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("option", { name: /QA-2 — QA OPCIÓN 2/ }));
    expect(view.props.onChange).toHaveBeenLastCalledWith([item(), item("2")]);
    expect(view.container.querySelector(".p-multiselect-label")).toHaveTextContent("QA-1 — QA OPCIÓN 1");
  });
  it("searches remotely and does not leave previous query options visible", async () => {
    vi.mocked(getPabellonCatalogue).mockResolvedValue(page()); show(); open(); await screen.findByRole("option");
    vi.mocked(getPabellonCatalogue).mockResolvedValue(page([]));
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar prestaciones" }), { target: { value: "ZZZ" } });
    await waitFor(() => expect(getPabellonCatalogue).toHaveBeenLastCalledWith("procedures", expect.objectContaining({ search: "ZZZ" })));
    expect(screen.queryByRole("option", { name: /QA OPCIÓN/ })).not.toBeInTheDocument();
  });
  it("releases loader after failure and prevents concurrent retries", async () => {
    vi.mocked(getPabellonCatalogue).mockRejectedValueOnce(new PabellonReadError("SOURCE_UNAVAILABLE")); show(); open(); await screen.findAllByRole("alert");
    let reject!: (error: Error) => void;
    vi.mocked(getPabellonCatalogue).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    const retry = screen.getAllByRole("button", { name: "Reintentar catálogo" })[0]!;
    fireEvent.click(retry); fireEvent.click(retry); await waitFor(() => expect(getPabellonCatalogue).toHaveBeenCalledTimes(2));
    await act(async () => reject(new PabellonReadError("SOURCE_TIMEOUT")));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Reintentar catálogo" })[0]).toBeEnabled());
  });
  it("keeps selections while loading a further page", async () => {
    vi.mocked(getPabellonCatalogue).mockResolvedValueOnce(page([item()], "NEXT")).mockResolvedValueOnce(page([item("2")]));
    const view = show({ multiple: true, value: [item("3")] }); open(); await screen.findByRole("option", { name: /QA-1/ });
    fireEvent.click(screen.getAllByRole("button", { name: "Cargar más opciones" })[0]!);
    fireEvent.click(await screen.findByRole("option", { name: /QA-2/ }));
    expect(view.props.onChange).toHaveBeenLastCalledWith([item("3"), item("2")]);
  });
  it("fails closed on inconsistent pages", async () => {
    const changed = page([item("2")]); changed.version = "b".repeat(64);
    vi.mocked(getPabellonCatalogue).mockResolvedValueOnce(page([item()], "NEXT")).mockResolvedValueOnce(changed); show(); open(); await screen.findByRole("option", { name: "QA-1 — QA OPCIÓN 1" });
    fireEvent.click(screen.getAllByRole("button", { name: "Cargar más opciones" })[0]!);
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent(/contrato esperado/);
  });
  it.each(["preoperative-assessments", "blood-samples"] as const)("renders %s as multiple checkboxes", async (group) => {
    vi.mocked(getPabellonCatalogue).mockResolvedValue(page([item("1", group), item("2", group)], null, group));
    const view = show({ catalogue: group, multiple: true });
    fireEvent.click(await screen.findByRole("checkbox", { name: "QA OPCIÓN 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "QA OPCIÓN 2" }));
    expect(view.props.onChange).toHaveBeenLastCalledWith([item("1", group), item("2", group)]);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("renders theatres as exclusive radio buttons", async () => {
    vi.mocked(getPabellonCatalogue).mockResolvedValue(page([item("1", "theatres"), item("2", "theatres")], null, "theatres"));
    const view = show({ catalogue: "theatres" });
    fireEvent.click(await screen.findByRole("radio", { name: "QA OPCIÓN 1" })); fireEvent.click(screen.getByRole("radio", { name: "QA OPCIÓN 2" }));
    expect(view.props.onChange).toHaveBeenLastCalledWith([item("2", "theatres")]);
    expect(screen.getByRole("radio", { name: "QA OPCIÓN 1" })).not.toBeChecked();
  });
  it("does not query without scope or when disabled", () => {
    const first = show({ disabled: true }); expect(first.container.querySelector(".p-dropdown")).toHaveClass("p-disabled"); first.unmount();
    show({ scopeKey: "", catalogue: "theatres" }); expect(getPabellonCatalogue).not.toHaveBeenCalled();
  });
  it("aborts pending lookup on unmount", async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(getPabellonCatalogue).mockImplementation((_group, options) => { signal = options?.signal; return new Promise(() => {}); });
    const view = show(); open(); await waitFor(() => expect(signal).toBeDefined()); view.unmount(); expect(signal!.aborted).toBe(true);
  });
});
