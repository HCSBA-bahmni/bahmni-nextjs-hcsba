import { describe, expect, it } from "vitest";
import { flattenFormTranslations } from "./formTranslations";

describe("Form Builder translations", () => {
  it("flattens the legacy endpoint response", () => {
    expect(flattenFormTranslations([{ labels: { SECTION_1: "Datos básicos" }, concepts: { HEIGHT_5: "Estatura" } }], "es"))
      .toEqual({ SECTION_1: "Datos básicos", HEIGHT_5: "Estatura" });
  });

  it("selects the requested locale from importable Form Builder bundles", () => {
    expect(flattenFormTranslations({
      en: { labels: { SECTION_1: "Basic Details" } },
      es: { labels: { SECTION_1: "Datos básicos" } },
    }, "es_CL")).toEqual({ SECTION_1: "Datos básicos" });
  });

  it("accepts serialized translation payloads without executing code", () => {
    expect(flattenFormTranslations('{"labels":{"SECTION_1":"Datos básicos"}}', "es"))
      .toEqual({ SECTION_1: "Datos básicos" });
  });
});
