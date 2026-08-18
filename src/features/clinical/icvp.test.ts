import { encode } from "cbor-x";
import { deflate } from "pako";
import { describe, expect, it } from "vitest";
import { decodeBase45, decodeIcvpPreview, icvpVaccinations, normalizeHc1 } from "./icvp";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
function encodeBase45(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 2) {
    if (index + 1 < bytes.length) {
      let value = bytes[index]! * 256 + bytes[index + 1]!;
      result += alphabet[value % 45]!; value = Math.floor(value / 45);
      result += alphabet[value % 45]!; result += alphabet[Math.floor(value / 45)]!;
    } else {
      const value = bytes[index]!;
      result += alphabet[value % 45]! + alphabet[Math.floor(value / 45)]!;
    }
  }
  return result;
}

describe("ICVP local preview", () => {
  it("normalizes pasted and prefix-less HC1 values", () => {
    expect(normalizeHc1(" hc1: ABC\nDEF ")).toBe("HC1:ABCDEF");
    expect(normalizeHc1("A".repeat(30))).toBe(`HC1:${"A".repeat(30)}`);
  });

  it("decodes base45 round trips", () => {
    const source = new Uint8Array([0, 1, 2, 127, 255]);
    expect(decodeBase45(encodeBase45(source))).toEqual(source);
  });

  it("decodes an HC1 COSE payload without claiming signature validation", () => {
    const hcert = { n: "Synthetic", dob: "2000-01-01", v: [{ vp: "SyntheticVaccine", dt: "2026-08-17" }] };
    const cwt = new Map<number, unknown>([[1, "synthetic-issuer"], [4, 2_000_000_000], [6, 1_900_000_000], [-260, new Map([[-6, hcert]])]]);
    const cose = [new Uint8Array(), new Map(), encode(cwt), new Uint8Array([1, 2, 3])];
    const hc1 = `HC1:${encodeBase45(deflate(encode(cose)))}`;
    const preview = decodeIcvpPreview(hc1);
    expect(preview.issuer).toBe("synthetic-issuer");
    expect(preview.hcert).toMatchObject({ n: "Synthetic", dob: "2000-01-01" });
    expect(icvpVaccinations(preview)).toEqual([{ vp: "SyntheticVaccine", dt: "2026-08-17" }]);
  });

  it("rejects text that is not HC1", () => {
    expect(() => decodeIcvpPreview("not-a-code")).toThrow("HC1");
  });
});
