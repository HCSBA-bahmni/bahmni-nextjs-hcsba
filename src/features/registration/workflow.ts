import type { AppExtension, Reference, Visit } from "@/types/bahmni";
import type { RegistrationConfig } from "@/config-compat/registrationConfig";

export type RegistrationSubmitIntent =
  | { kind: "save" }
  | { kind: "startVisit"; visitTypeUuid: string; visitTypeName: string; forwardUrl?: string }
  | { kind: "enterVisit"; visitUuid: string }
  | { kind: "forward"; url: string; visitUuid?: string };

export interface RegistrationWorkflowAction {
  intent: RegistrationSubmitIntent;
  translationKey: string;
  defaultLabel: string;
  icon: string;
  disabled?: boolean;
}

interface ResolveWorkflowInput {
  activeVisit?: Visit;
  config: RegistrationConfig;
  nextExtension?: AppExtension;
  selectedVisitType?: Reference;
  canStartVisit: boolean;
}

function extensionParams(extension?: AppExtension): Record<string, unknown> {
  const params = extension?.extensionParams;
  return params && typeof params === "object" && !Array.isArray(params) ? params as Record<string, unknown> : {};
}

export function resolveRegistrationWorkflow({ activeVisit, config, nextExtension, selectedVisitType, canStartVisit }: ResolveWorkflowInput): RegistrationWorkflowAction | null {
  const params = extensionParams(nextExtension);
  const configuredForwardUrl = typeof params.forwardUrl === "string" ? params.forwardUrl : undefined;
  if (nextExtension && configuredForwardUrl) {
    const display = typeof params.display === "string" ? params.display : "Continuar";
    return activeVisit
      ? { intent: { kind: "forward", url: configuredForwardUrl, visitUuid: activeVisit.uuid }, translationKey: display, defaultLabel: display, icon: "pi pi-arrow-right" }
      : selectedVisitType
        ? { intent: { kind: "startVisit", visitTypeUuid: selectedVisitType.uuid, visitTypeName: selectedVisitType.name ?? selectedVisitType.display ?? selectedVisitType.uuid, forwardUrl: configuredForwardUrl }, translationKey: display, defaultLabel: display, icon: "pi pi-check", disabled: !canStartVisit }
        : null;
  }

  if (activeVisit) {
    const activeTypeName = activeVisit.visitType?.name ?? activeVisit.visitType?.display;
    const forward = config.forwardUrlsForVisitTypes.find((entry) => entry.visitType === activeTypeName);
    if (forward) return {
      intent: { kind: "forward", url: forward.forwardUrl, visitUuid: activeVisit.uuid },
      translationKey: forward.translationKey ?? "REGISTRATION_LABEL_ENTER_VISIT",
      defaultLabel: "Ingresar a visita",
      icon: "pi pi-arrow-right",
    };
    return { intent: { kind: "enterVisit", visitUuid: activeVisit.uuid }, translationKey: "REGISTRATION_LABEL_ENTER_VISIT", defaultLabel: "Ingresar a visita", icon: "pi pi-calendar-plus" };
  }

  if (!config.showStartVisitButton || !selectedVisitType) return null;
  const visitTypeName = selectedVisitType.name ?? selectedVisitType.display ?? selectedVisitType.uuid;
  const forward = config.forwardUrlsForVisitTypes.find((entry) => entry.visitType === visitTypeName);
  return {
    intent: { kind: "startVisit", visitTypeUuid: selectedVisitType.uuid, visitTypeName, forwardUrl: forward?.forwardUrl },
    translationKey: "REGISTRATION_START_VISIT",
    defaultLabel: `Empezar visita ${visitTypeName}`,
    icon: "pi pi-calendar-plus",
    disabled: !canStartVisit,
  };
}

export function formatRegistrationDestination(template: string, patientUuid: string, visitUuid?: string): string {
  return template.replaceAll("{{patientUuid}}", patientUuid).replaceAll("{{visitUuid}}", visitUuid ?? "");
}

export function isNextRegistrationDestination(destination: string): boolean {
  return destination.startsWith("/registration/") || destination === "/registration" || destination.startsWith("/patient/");
}

export function toNextRegistrationRoute(destination: string): string {
  return destination.startsWith("/patient/") ? `/registration${destination}` : destination;
}
