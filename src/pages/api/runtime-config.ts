import type { NextApiRequest, NextApiResponse } from "next";

const enabled = (value: string | undefined) => value === "true";

export default function handler(_request: NextApiRequest, response: NextApiResponse) {
  response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  response.status(200).json({
    openmrsBase: process.env.NEXT_PUBLIC_OPENMRS_BASE ?? "/openmrs",
    configBase: process.env.NEXT_PUBLIC_CONFIG_BASE ?? "/bahmni_config/openmrs/apps",
    implementationConfigBase: process.env.NEXT_PUBLIC_IMPLEMENTATION_CONFIG_BASE ?? "/implementation_config/openmrs/apps",
    legacyBahmniBase: process.env.NEXT_PUBLIC_LEGACY_BAHMNI_BASE ?? "/bahmni",
    defaultLocale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "es",
    authMode: process.env.NEXT_PUBLIC_AUTH_MODE === "keycloak" ? "keycloak" : "openmrs",
    integrations: {
      ips: {
        enabled: enabled(process.env.NEXT_PUBLIC_IPS_ENABLED),
        pdqmBase: process.env.NEXT_PUBLIC_IPS_PDQM_BASE ?? "",
        regionalBase: process.env.NEXT_PUBLIC_IPS_REGIONAL_BASE ?? "",
        vhlGeneratePath: process.env.NEXT_PUBLIC_IPS_VHL_GENERATE_PATH ?? "",
        vhlResolvePath: process.env.NEXT_PUBLIC_IPS_VHL_RESOLVE_PATH ?? "",
        icvpFromBundlePath: process.env.NEXT_PUBLIC_ICVP_FROM_BUNDLE_PATH ?? "",
      },
    },
    features: { registration: true, legacyNavigation: true, clinicalConsultationEnabled: enabled(process.env.NEXT_PUBLIC_CLINICAL_CONSULTATION_ENABLED) },
  });
}
