import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminBedLayout, AdminBedTag } from "@/features/admin/beds";
import { classifyAdminBeds, type BedClassificationCommand } from "./bedClassification";
import { addAdminBedTag, deleteAdminBedTagMap, getAdminBedLayout, getAdminBedTags, getOperationalConditions } from "./adminBeds";

vi.mock("./adminBeds", () => ({ addAdminBedTag: vi.fn(), deleteAdminBedTagMap: vi.fn(), getAdminBedLayout: vi.fn(), getAdminBedTags: vi.fn(), getOperationalConditions: vi.fn() }));
const tags: AdminBedTag[] = [
  { id: 21, uuid: "uti", name: "Complejidad: Crítica UTI", description: "" },
  { id: 22, uuid: "uci", name: "Complejidad: Crítica UCI", description: "" },
  { id: 10, uuid: "adult", name: "Clasificación: Adulto", description: "" },
  { id: 30, uuid: "maintenance", name: "Condición: Mantenimiento", description: "" },
];
const command: BedClassificationCommand = { wardUuid: "ward", bedUuids: ["bed-7", "bed-8"], draft: { complexity: tags[0]!.name, age: "", specialUse: "", operational: "" } };
let layout: AdminBedLayout;
beforeEach(() => {
  vi.resetAllMocks();
  layout = { ward: { uuid: "ward", name: "Sala", description: "" }, rows: 1, columns: 2, beds: [7, 8].map((id) => ({ bedId: id, bedUuid: `bed-${id}`, bedNumber: `C-${id}`, rowNumber: 1, columnNumber: id - 6, status: "AVAILABLE", bedTagMaps: [{ uuid: `old-${id}`, bedTag: tags[1]! }, { uuid: `isolation-${id}`, bedTag: { id: 1, uuid: "isolation", name: "Aislamiento" } }] })) };
  vi.mocked(getAdminBedLayout).mockImplementation(async () => structuredClone(layout));
  vi.mocked(getAdminBedTags).mockResolvedValue(tags);
  vi.mocked(getOperationalConditions).mockResolvedValue([{ ...tags[3]!, label: "Mantenimiento", active: false }]);
  vi.mocked(addAdminBedTag).mockImplementation(async (id, tagId) => { layout.beds.find((bed) => bed.bedId === id)!.bedTagMaps.push({ uuid: `new-${id}-${tagId}`, bedTag: tags.find((tag) => tag.id === tagId)! }); });
  vi.mocked(deleteAdminBedTagMap).mockImplementation(async (uuid) => { for (const bed of layout.beds) bed.bedTagMaps = bed.bedTagMaps.filter((map) => map.uuid !== uuid); });
});
describe("categorización recuperable de camas", () => {
  it("confirma la nueva etiqueta antes de borrar la anterior y conserva aislamiento", async () => {
    await classifyAdminBeds(command);
    expect(vi.mocked(addAdminBedTag).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deleteAdminBedTagMap).mock.invocationCallOrder[0]!);
    expect(layout.beds.every((bed) => bed.bedTagMaps.some((map) => map.bedTag.id === 1))).toBe(true);
    expect(layout.beds.every((bed) => bed.bedTagMaps.filter((map) => map.bedTag.name.startsWith("Complejidad:")).map((map) => map.bedTag.id).join() === "21")).toBe(true);
  });
  it("recupera un lote parcial sin repetir la primera cama", async () => {
    vi.mocked(addAdminBedTag).mockImplementationOnce(async () => { layout.beds[0]!.bedTagMaps.push({ uuid: "new-7", bedTag: tags[0]! }); }).mockRejectedValueOnce(new Error("fallo segunda cama"));
    await expect(classifyAdminBeds(command)).rejects.toThrow("fallo segunda cama");
    await classifyAdminBeds(command);
    expect(vi.mocked(addAdminBedTag).mock.calls.filter(([id]) => id === 7)).toHaveLength(1);
    expect(layout.beds[1]!.bedTagMaps.some((map) => map.bedTag.id === 21)).toBe(true);
  });
  it("lee tras una respuesta perdida de POST y no duplica el alta confirmada", async () => {
    vi.mocked(addAdminBedTag).mockImplementationOnce(async () => { layout.beds[0]!.bedTagMaps.push({ uuid: "committed", bedTag: tags[0]! }); throw new Error("respuesta perdida"); });
    await expect(classifyAdminBeds(command)).rejects.toThrow("respuesta perdida");
    expect(deleteAdminBedTagMap).not.toHaveBeenCalled();
    await classifyAdminBeds(command);
    expect(vi.mocked(addAdminBedTag).mock.calls.filter(([id]) => id === 7)).toHaveLength(1);
  });
  it("no repite DELETE confirmado cuando se pierde su respuesta", async () => {
    vi.mocked(deleteAdminBedTagMap).mockImplementationOnce(async (uuid) => { layout.beds[0]!.bedTagMaps = layout.beds[0]!.bedTagMaps.filter((map) => map.uuid !== uuid); throw new Error("respuesta perdida"); });
    await expect(classifyAdminBeds(command)).rejects.toThrow("respuesta perdida");
    await classifyAdminBeds(command);
    expect(vi.mocked(deleteAdminBedTagMap).mock.calls.filter(([uuid]) => uuid === "old-7")).toHaveLength(1);
  });
  it("conserva la etiqueta anterior si el POST falla o no se confirma por lectura", async () => {
    vi.mocked(addAdminBedTag).mockResolvedValue(undefined);
    await expect(classifyAdminBeds(command)).rejects.toThrow("no confirmó");
    expect(deleteAdminBedTagMap).not.toHaveBeenCalled();
    expect(layout.beds[0]!.bedTagMaps.some((map) => map.bedTag.id === 22)).toBe(true);
  });
  it("rechaza condición inactiva sin escribir", async () => {
    await expect(classifyAdminBeds({ ...command, draft: { ...command.draft, operational: tags[3]!.name } })).rejects.toThrow("activa");
    expect(addAdminBedTag).not.toHaveBeenCalled();
  });
  it("valida todos los IDs incluso al actualizar sólo complejidad", async () => {
    layout.beds[1]!.bedId = 0;
    await expect(classifyAdminBeds(command)).rejects.toThrow("identificador");
    expect(addAdminBedTag).not.toHaveBeenCalled();
  });
  it("no escribe si falla la lectura de estado durable", async () => {
    vi.mocked(getAdminBedLayout).mockRejectedValue(new Error("sin conexión"));
    await expect(classifyAdminBeds(command)).rejects.toThrow("sin conexión");
    expect(addAdminBedTag).not.toHaveBeenCalled();
  });
  it("rechaza un catálogo ambiguo sin modificar ninguna cama", async () => {
    vi.mocked(getAdminBedTags).mockResolvedValue([...tags, { ...tags[0]!, id: 99, uuid: "duplicate" }]);
    await expect(classifyAdminBeds(command)).rejects.toThrow("única");
    expect(addAdminBedTag).not.toHaveBeenCalled();
  });
});
