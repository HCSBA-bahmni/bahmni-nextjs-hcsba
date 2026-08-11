import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const forbidden = [
  ["AngularJS runtime", /angular\.module\s*\(/i],
  ["jQuery runtime", /(?:window\.)?jQuery\s*[.(]/],
  ["react2angular bridge", /react2angular/i],
  ["angular-component bridge", /angular-component/i],
  ["legacy next-ui bundle", /next-ui\.min\.js/i],
  ["legacy microfrontend distribution", /micro-frontends-dist/i],
];

function filesBelow(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

const candidates = [
  ...filesBelow(join(root, ".next", "static", "chunks")).filter((path) => path.endsWith(".js")),
  ...filesBelow(join(root, "src")).filter((path) => /\.(?:ts|tsx|css)$/.test(path)),
];
const failures = [];
for (const path of candidates) {
  const source = readFileSync(path, "utf8");
  for (const [label, pattern] of forbidden) if (pattern.test(source)) failures.push(`${label}: ${relative(root, path)}`);
}
if (failures.length) {
  console.error(`Dashboard runtime audit failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`Dashboard runtime audit passed (${candidates.length} source/bundle files, 0 forbidden runtimes).`);
