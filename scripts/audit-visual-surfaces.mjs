import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Source inventory only: this does not certify rendered geometry or runtime menus.
const fixHints = process.argv.includes("--fix-icon-hints");
const details = process.argv.includes("--details");
const surfaces = [];
const changedFiles = [];
const tags = new Set([
  "Button", "button", "Dialog", "ConfirmDialog", "Menu", "Dropdown", "MultiSelect",
  "h1", "h2", "h3", "InputText", "InputTextarea", "InputNumber", "Calendar",
  "Password", "AutoComplete",
]);

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { scan(file); continue; }
    if (!file.endsWith(".tsx") || file.endsWith(".test.tsx")) continue;
    const text = fs.readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edits = [];
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        if (tags.has(tag)) {
          const attrs = new Map(node.attributes.properties.filter(ts.isJsxAttribute)
            .map((attribute) => [attribute.name.getText(source), attribute]));
          const value = (name) => attrs.get(name)?.initializer?.getText(source);
          const missingHint = tag === "Button" && attrs.has("icon") && !attrs.has("label")
            && !attrs.has("tooltip") && !attrs.has("title");
          const name = value("aria-label");
          surfaces.push({ file: file.replaceAll(path.sep, "/"),
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
            tag, title: value("header"), name, missingHint });
          // Reuse the existing accessible label verbatim; never invent action names.
          if (fixHints && missingHint && name) {
            edits.push({ position: attrs.get("aria-label").end, text: ` tooltip=${name}` });
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (edits.length) {
      let updated = text;
      for (const edit of edits.sort((a, b) => b.position - a.position)) {
        updated = updated.slice(0, edit.position) + edit.text + updated.slice(edit.position);
      }
      fs.writeFileSync(file, updated);
      changedFiles.push({ file, hints: edits.length });
    }
  }
}

scan("src");
const counts = Object.fromEntries([...tags].sort()
  .map((tag) => [tag, surfaces.filter((surface) => surface.tag === tag).length]));
console.log(JSON.stringify({ scope: "Static Next.js source; not browser verification",
  files: new Set(surfaces.map((surface) => surface.file)).size, counts, changedFiles,
  iconButtonsWithoutHint: surfaces.filter((surface) => surface.missingHint),
  ...(details ? { surfaces } : {}),
}, null, 2));
