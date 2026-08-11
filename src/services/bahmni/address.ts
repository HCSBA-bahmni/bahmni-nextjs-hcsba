import { z } from "zod";
import { bahmniRequest, queryString } from "./http";

export interface AddressLevel { name: string; addressField: string; required?: boolean }
export interface AddressEntry { uuid?: string; name: string; userGeneratedId?: string; addressField?: string; parent?: AddressEntry; [key: string]: unknown }

const level = z.object({ name: z.string(), addressField: z.string(), required: z.boolean().optional() }).loose();
const entry: z.ZodType<AddressEntry> = z.object({ uuid: z.string().optional(), name: z.string(), userGeneratedId: z.string().optional(), addressField: z.string().optional(), parent: z.lazy(() => entry).optional() }).loose();

export async function getAddressLevels(): Promise<AddressLevel[]> { return await bahmniRequest("/module/addresshierarchy/ajax/getOrderedAddressHierarchyLevels.form", { schema: z.array(level) }); }
export async function searchAddressEntries(addressField: string, searchString: string, parentUuid?: string): Promise<AddressEntry[]> { return await bahmniRequest(`/module/addresshierarchy/ajax/getPossibleAddressHierarchyEntriesWithParents.form${queryString({ addressField, searchString, parentUuid, limit: 20 })}`, { schema: z.array(entry) }); }
