import { z } from "zod";

const runtimeConfigSchema = z.object({
  integrations: z.object({
    ips: z.object({
      enabled: z.boolean(),
      pdqmBase: z.string(),
      regionalBase: z.string(),
      vhlGeneratePath: z.string(),
      vhlResolvePath: z.string(),
      icvpFromBundlePath: z.string(),
    }).passthrough(),
  }).passthrough(),
  features: z.object({
    registration: z.boolean().default(true),
    legacyNavigation: z.boolean().default(true),
    clinicalConsultationEnabled: z.boolean().default(false),
  }).passthrough(),
}).passthrough();

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch("/bahmni/api/runtime-config", { credentials: "include" });
  if (!response.ok) throw new Error(`runtime-config ${response.status}`);
  return runtimeConfigSchema.parse(await response.json());
}
