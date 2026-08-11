import { z, type ZodType } from "zod";import { bahmniRequest,queryString } from "./http";
const bundle=z.object({resourceType:z.literal("Bundle"),entry:z.array(z.object({resource:z.unknown()}).loose()).optional()}).loose();
export async function searchFhir<T>(resourceType:string,params:Record<string,string>,resourceSchema:ZodType<T>):Promise<T[]>{const result=await bahmniRequest(`/ws/fhir2/R4/${resourceType}${queryString(params)}`,{schema:bundle});return (result.entry??[]).map(item=>resourceSchema.parse(item.resource));}
