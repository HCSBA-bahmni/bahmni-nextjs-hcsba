import { z } from "zod";
import { bahmniRequest } from "./http";
const uuid=z.string().uuid();
const result=z.object({surgeryId:z.string().regex(/^[1-9][0-9]*$/),requestNumber:z.string().regex(/^[1-9][0-9]{8}$/),version:z.number().int().nonnegative(),visitUuid:z.union([uuid,z.literal("")]),encounterUuid:z.union([uuid,z.literal("")]),active:z.boolean()}).strict();
export type RequestLinkResult=z.infer<typeof result>;
export interface RequestLinkCommand {action:"preview"|"link"|"unlink";requestNumber:string;visitUuid:string;encounterUuid:string;expectedVersion:number}
export async function requestPabellonLink(patient:string,command:RequestLinkCommand):Promise<RequestLinkResult>{
  if(!uuid.safeParse(patient).success || !/^[1-9][0-9]{8}$/.test(command.requestNumber))throw new Error("Ingrese un N° de solicitud válido de nueve dígitos.");
  return bahmniRequest("/pabellon-gateway/v1/patients/"+patient+"/request-link",{method:"POST",body:JSON.stringify(command),schema:result,cache:"no-store",skipUnauthorizedEvent:true});
}
