import Code128Encoder from "jsbarcode/bin/barcodes/CODE128/CODE128_AUTO";

export interface BarcodeBar {
  x: number;
  width: number;
}

export interface Code128Barcode {
  bars: BarcodeBar[];
  modules: number;
  text: string;
}

/**
 * Uses only JsBarcode's CODE128 encoder. Rendering remains owned by React, so
 * the browser bundle does not include the library's optional DOM/jQuery API.
 */
export function encodeCode128(value: string): Code128Barcode | undefined {
  const text = value.trim();
  if (!text) return undefined;

  const encoder = new Code128Encoder(text, {});
  if (!encoder.valid()) return undefined;

  const encoding = encoder.encode();
  const bars: BarcodeBar[] = [];
  let start = -1;

  for (let index = 0; index <= encoding.data.length; index += 1) {
    if (encoding.data[index] === "1" && start < 0) start = index;
    if (encoding.data[index] !== "1" && start >= 0) {
      bars.push({ x: start, width: index - start });
      start = -1;
    }
  }

  return { bars, modules: encoding.data.length, text: encoding.text || text };
}
