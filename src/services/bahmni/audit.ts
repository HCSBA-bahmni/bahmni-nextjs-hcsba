import { bahmniRequest } from "./http";

export async function audit(eventType: string, message: string, patientUuid?: string, module = "MODULE_LABEL_HOME_KEY"): Promise<void> {
  try {
    await bahmniRequest("/ws/rest/v1/auditlog", {
      method: "POST",
      body: JSON.stringify({ eventType, message, patientUuid, module }),
    });
  } catch {
    // Audit availability must not block clinical workflows; never include credentials/PHI here.
  }
}
