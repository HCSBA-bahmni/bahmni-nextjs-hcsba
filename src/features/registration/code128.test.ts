import { describe, expect, it } from "vitest";
import { encodeCode128 } from "./code128";

describe("encodeCode128", () => {
  it("encodes HCSBA identifiers into deterministic bar runs", () => {
    const encoded = encodeCode128("RUT*18153422-2");

    expect(encoded?.text).toBe("RUT*18153422-2");
    expect(encoded?.modules).toBeGreaterThan(100);
    expect(encoded?.bars.length).toBeGreaterThan(20);
    expect(encoded?.bars.every((bar) => bar.width > 0)).toBe(true);
  });

  it("does not produce a barcode for an empty identifier", () => {
    expect(encodeCode128("   ")).toBeUndefined();
  });
});
