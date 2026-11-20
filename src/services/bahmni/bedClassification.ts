import { BED_COMPLEXITIES, COMPLEMENTARY_BED_CLASSIFICATIONS, OPERATIONAL_CONDITION_PREFIX, type AdminBed, type AdminBedLayout } from "@/features/admin/beds";
import { addAdminBedTag, deleteAdminBedTagMap, getAdminBedLayout, getAdminBedTags, getOperationalConditions } from "./adminBeds";

export interface BedClassificationDraft { complexity: string; age: string; specialUse: string; operational: string }
export interface BedClassificationCommand { wardUuid: string; bedUuids: string[]; draft: BedClassificationDraft }

/** A manual continuation always reads OpenMRS again. Never retry a mutation automatically. */
export async function classifyAdminBeds({ wardUuid, bedUuids, draft }: BedClassificationCommand): Promise<AdminBedLayout> {
  const [initial, tags, conditions] = await Promise.all([getAdminBedLayout(wardUuid), getAdminBedTags(), getOperationalConditions()]);
  const requested = [...new Set(bedUuids)];
  if (!requested.length || !Object.values(draft).some(Boolean)) throw new Error("Seleccione camas y al menos una clasificación.");
  const dimensions = (["complexity", "age", "specialUse", "operational"] as const).filter((group) => draft[group]).map((group) => {
    const name = draft[group];
    const allowed = group === "complexity" ? BED_COMPLEXITIES.some((item) => item.tagName === name)
      : group === "operational" ? conditions.some((item) => item.name === name && item.active)
        : COMPLEMENTARY_BED_CLASSIFICATIONS.some((item) => item.group === group && item.name === name);
    const matches = tags.filter((tag) => tag.name === name && tag.id > 0);
    if (!allowed || matches.length !== 1) throw new Error(`La clasificación “${name}” no está configurada de forma única y activa en OpenMRS.`);
    const belongs = (tagName: string) => group === "complexity" ? BED_COMPLEXITIES.some((item) => item.tagName === tagName)
      : group === "operational" ? tagName.startsWith(OPERATIONAL_CONDITION_PREFIX)
        : COMPLEMENTARY_BED_CLASSIFICATIONS.some((item) => item.group === group && item.name === tagName);
    return { tag: matches[0]!, belongs };
  });
  function findBed(layout: AdminBedLayout, uuid: string): AdminBed {
    const matches = layout.beds.filter((bed) => bed.bedUuid === uuid);
    if (matches.length !== 1 || matches[0]!.bedId <= 0) throw new Error("Una cama seleccionada cambió de sala o no tiene un identificador válido. Revise la selección.");
    return matches[0]!;
  }
  // Validate the entire selection before the first write.
  for (const uuid of requested) findBed(initial, uuid);
  let current = initial;
  for (const uuid of requested) {
    for (const { tag, belongs } of dimensions) {
      let bed = findBed(current, uuid);
      if (!bed.bedTagMaps.some((map) => map.bedTag.id === tag.id)) {
        await addAdminBedTag(bed.bedId, tag.id);
        current = await getAdminBedLayout(wardUuid);
        bed = findBed(current, uuid);
        if (!bed.bedTagMaps.some((map) => map.bedTag.id === tag.id)) throw new Error("OpenMRS no confirmó la nueva clasificación. Revise lo guardado antes de continuar.");
      }
      // Confirm the replacement before removing the old classification. Other groups remain intact.
      const previous = bed.bedTagMaps.filter((map) => belongs(map.bedTag.name) && map.bedTag.id !== tag.id);
      for (const map of previous) {
        await deleteAdminBedTagMap(map.uuid);
        current = await getAdminBedLayout(wardUuid);
        bed = findBed(current, uuid);
        if (bed.bedTagMaps.some((item) => item.uuid === map.uuid) || !bed.bedTagMaps.some((item) => item.bedTag.id === tag.id)) {
          throw new Error("OpenMRS no confirmó el reemplazo de la clasificación. Revise lo guardado antes de continuar.");
        }
      }
    }
  }
  return current;
}
