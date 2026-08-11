import type { NextRouter } from "next/router";
import { resolveExtensionUrl } from "@/config-compat/legacyRoutes";
import { audit } from "@/services/bahmni/audit";
import { startVisit } from "@/services/bahmni/visits";
import { formatRegistrationDestination, isNextRegistrationDestination, toNextRegistrationRoute, type RegistrationSubmitIntent } from "./workflow";

async function navigate(destination: string, router: NextRouter): Promise<void> {
  const withoutBasePath = destination.startsWith("/bahmni/registration") ? destination.slice("/bahmni".length) : destination;
  if (isNextRegistrationDestination(withoutBasePath)) {
    await router.push(toNextRegistrationRoute(withoutBasePath));
    return;
  }
  const resolved = resolveExtensionUrl(destination);
  if (resolved.kind === "next") {
    await router.push(resolved.href.startsWith("/bahmni/") ? resolved.href.slice("/bahmni".length) : resolved.href);
    return;
  }
  window.location.assign(destination);
}

export async function executeRegistrationWorkflow(intent: RegistrationSubmitIntent, patientUuid: string, visitLocationUuid: string | undefined, router: NextRouter): Promise<void> {
  if (intent.kind === "save") {
    await router.push({ pathname: `/registration/patient/${patientUuid}`, query: { saved: "1" } });
    return;
  }
  if (intent.kind === "enterVisit") {
    await router.push({ pathname: `/registration/patient/${patientUuid}/visit`, query: { visitUuid: intent.visitUuid } });
    return;
  }
  if (intent.kind === "forward") {
    await navigate(formatRegistrationDestination(intent.url, patientUuid, intent.visitUuid), router);
    return;
  }
  if (!visitLocationUuid) throw new Error("La ubicación actual no está asociada a una ubicación de visita.");
  const visit = await startVisit(patientUuid, intent.visitTypeUuid, visitLocationUuid);
  void audit("OPEN_VISIT", JSON.stringify({ visitUuid: visit.uuid, visitType: intent.visitTypeName }), patientUuid, "MODULE_LABEL_REGISTRATION_KEY");
  if (intent.forwardUrl) {
    await navigate(formatRegistrationDestination(intent.forwardUrl, patientUuid, visit.uuid), router);
    return;
  }
  await router.push({ pathname: `/registration/patient/${patientUuid}/visit`, query: { visitUuid: visit.uuid } });
}
