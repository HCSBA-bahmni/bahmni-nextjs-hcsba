import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(`${process.cwd()}/src/styles/visual-system.css`, "utf8");
const surface = ".app-shell .ipd-individual-patient-header .ipd-individual-bed";
function declarations(selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}
function luminance(hex: string) {
  const rgb = hex.match(/[a-f\d]{2}/gi)!.map((v) => parseInt(v, 16) / 255);
  const [r = 0, g = 0, b = 0] = rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
describe("patient context light surface inside dark header", () => {
  it("does not force white text on the light bed summary", () => {
    expect(css).not.toContain(".app-shell .ipd-individual-bed :is(strong, small)");
    expect(declarations(surface)).toContain("background: #fff;");
    expect(declarations(`${surface} small`)).toContain("color: #526873;");
    expect(declarations(`${surface} strong`)).toContain("color: #17333d;");
  });
  it("keeps both label and bed value above WCAG AA normal text contrast", () => {
    for (const selector of [`${surface} small`, `${surface} strong`]) {
      const color = declarations(selector).match(/color:\s*(#[a-f\d]{6})/i)![1]!;
      expect(1.05 / (luminance(color) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
