declare module "jsbarcode/bin/barcodes/CODE128/CODE128_AUTO" {
  interface Code128Encoding {
    data: string;
    text: string;
  }

  export default class Code128Encoder {
    constructor(data: string, options?: { ean128?: boolean | string });
    valid(): boolean;
    encode(): Code128Encoding;
  }
}
