import type { ConsultationOrder } from "./types";

export interface OrderableName {
  name: string;
  conceptNameType?: string;
  locale?: string;
}

export interface OrderableConceptClass {
  uuid?: string;
  name: string;
  description?: string;
}

export interface OrderableConcept {
  uuid: string;
  name?: string | { name?: string; display?: string };
  names: OrderableName[];
  set: boolean;
  conceptClass?: OrderableConceptClass;
  setMembers: OrderableConcept[];
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
  : [];

const string = (value: unknown): string => typeof value === "string" ? value : "";

export function normalizeOrderableConcept(value: unknown): OrderableConcept | undefined {
  const source = object(value);
  const uuid = string(source.uuid);
  if (!uuid) return undefined;
  const conceptClass = object(source.conceptClass);
  return {
    uuid,
    name: typeof source.name === "string" ? source.name : object(source.name) as { name?: string; display?: string },
    names: records(source.names).flatMap((name) => string(name.name) ? [{
      name: string(name.name),
      conceptNameType: string(name.conceptNameType) || undefined,
      locale: string(name.locale) || undefined,
    }] : []),
    set: source.set === true,
    conceptClass: string(conceptClass.name) ? {
      uuid: string(conceptClass.uuid) || undefined,
      name: string(conceptClass.name),
      description: string(conceptClass.description) || undefined,
    } : undefined,
    setMembers: records(source.setMembers).flatMap((member) => {
      const normalized = normalizeOrderableConcept(member);
      return normalized ? [normalized] : [];
    }),
  };
}

function named(concept: OrderableConcept, type: string, locale?: string): string | undefined {
  return concept.names.find((name) => name.conceptNameType === type && (!locale || name.locale === locale))?.name;
}

/** Legacy prefers SHORT, then FULLY_SPECIFIED, then the published concept name. */
export function orderableName(concept: OrderableConcept): string {
  return named(concept, "SHORT")
    ?? named(concept, "FULLY_SPECIFIED")
    ?? (typeof concept.name === "string" ? concept.name : concept.name?.name ?? concept.name?.display)
    ?? concept.uuid;
}

export function orderableDefaultName(concept: OrderableConcept, locale = "en"): string {
  return named(concept, "FULLY_SPECIFIED", locale)
    ?? named(concept, "FULLY_SPECIFIED")
    ?? orderableName(concept);
}

/** Applies app.json orderTypeClassMap at the same category-member level as AngularJS. */
export function configuredOrderableTemplates(
  allOrderables: unknown,
  orderTypeClassMap: Record<string, string[]>,
  defaultLocale = "en",
): OrderableConcept[] {
  const root = normalizeOrderableConcept(allOrderables);
  if (!root) return [];
  return root.setMembers.map((template) => {
    const allowedClasses = orderTypeClassMap[orderableDefaultName(template, defaultLocale)];
    if (!allowedClasses) return template;
    return {
      ...template,
      setMembers: template.setMembers.map((category) => ({
        ...category,
        setMembers: category.setMembers.filter((orderable) => Boolean(orderable.conceptClass?.name && allowedClasses.includes(orderable.conceptClass.name))),
      })),
    };
  });
}

export function orderableGroups(category: OrderableConcept | undefined): OrderableConceptClass[] {
  const byName = new Map<string, OrderableConceptClass>();
  category?.setMembers.forEach((orderable) => {
    if (orderable.conceptClass?.name && !byName.has(orderable.conceptClass.name)) byName.set(orderable.conceptClass.name, orderable.conceptClass);
  });
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function orderableMatchesSearch(orderable: OrderableConcept, search: string): boolean {
  const normalized = search.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [orderableName(orderable), ...orderable.names.map((name) => name.name)].some((name) => name.toLocaleLowerCase().includes(normalized));
}

export function templateOrderableUuids(template: OrderableConcept): Set<string> {
  return new Set(template.setMembers.flatMap((category) => category.setMembers.map((orderable) => orderable.uuid)));
}

/** A test may belong to more than one panel; preserve every parent like legacy. */
export function orderableParentMap(template: OrderableConcept): Map<string, Set<string>> {
  const parents = new Map<string, Set<string>>();
  template.setMembers.forEach((category) => category.setMembers.forEach((orderable) => orderable.setMembers.forEach((child) => {
    const childParents = parents.get(child.uuid) ?? new Set<string>();
    childParents.add(orderable.uuid);
    parents.set(child.uuid, childParents);
  })));
  return parents;
}

export function activeOrderForConcept(orders: ConsultationOrder[], conceptUuid: string): ConsultationOrder | undefined {
  return orders.find((order) => !order.voided && order.action !== "DISCONTINUE" && order.concept.uuid === conceptUuid);
}

export function orderableIsIndirectlySelected(orders: ConsultationOrder[], conceptUuid: string, parentMap: Map<string, Set<string>>): boolean {
  const parents = parentMap.get(conceptUuid);
  return Boolean(parents && [...parents].some((parentUuid) => activeOrderForConcept(orders, parentUuid)));
}
