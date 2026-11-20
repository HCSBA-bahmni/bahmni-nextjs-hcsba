import { z } from "zod";
import { bahmniRequest } from "./http";
const uuid = z.string().uuid();
const reference = z.union([uuid, z.literal("")]);
const result = z.object({
  surgeryId: z.string().regex(/^[1-9][0-9]*$/), requestNumber: z.string().regex(/^[1-9][0-9]{8}$/),
  version: z.number().int().nonnegative(), visitUuid: reference, encounterUuid: reference, active: z.boolean(),
}).strict().refine((value) => value.active ? value.visitUuid !== "" : value.visitUuid === "" && value.encounterUuid === "");
const commandSchema = z.object({
  action: z.enum(["preview", "link", "unlink"]), requestNumber: z.string().regex(/^[1-9][0-9]{8}$/),
  visitUuid: reference, encounterUuid: reference, expectedVersion: z.number().int().nonnegative(),
}).strict().refine((value) => value.action === "link" ? value.visitUuid !== "" : value.visitUuid === "" && value.encounterUuid === "");
export type RequestLinkResult = z.infer<typeof result>;
export type RequestLinkCommand = z.infer<typeof commandSchema>;
export async function requestPabellonLink(patient: string, command: RequestLinkCommand): Promise<RequestLinkResult> {
  if (!uuid.safeParse(patient).success || !commandSchema.safeParse(command).success) throw new Error("Revise el N° de solicitud y la atención seleccionada.");
  const response = await bahmniRequest("/pabellon-gateway/v1/patients/" + patient + "/request-link", {
    method: "POST", body: JSON.stringify(command), schema: result, cache: "no-store", skipUnauthorizedEvent: true,
  });
  if (response.requestNumber !== command.requestNumber || command.action === "link" && (!response.active || response.visitUuid !== command.visitUuid || response.encounterUuid !== command.encounterUuid) || command.action === "unlink" && response.active) {
    throw new Error("No se pudo confirmar el vínculo solicitado. Vuelva a verificar la solicitud antes de continuar.");
  }
  return response;
}
