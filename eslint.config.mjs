import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // Copied byte-for-byte from the pinned dependency by prepare-pdf-worker.mjs.
  globalIgnores([".next/**", "coverage/**", "playwright-report/**", "public/vendor/pdfjs/**"]),
]);
