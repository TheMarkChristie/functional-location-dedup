/**
 * Assembles the Power Platform ToolBox distribution into ./dist.
 * PPTB loads `main` (index.html) and `icon` relative to the dist root.
 *
 * SINGLE SOURCE OF TRUTH: the tool UI is the dual-mode web resource
 *   ../webresource/prx3_FunctionalLocationMerge.html
 * It uses window.dataverseAPI when running inside ToolBox, and same-origin fetch
 * when served as a Dataverse web resource / XrmToolBox WebView2. This script just
 * copies that one file (+ icon + the shared stylesheet) into dist/ so all hosts
 * stay in line.
 *
 * There is deliberately NO theme injection any more. The HTML sets body[data-host]
 * at runtime and its Fluent 2 token block carries a palette for each host, so PPTB
 * gets Fluent dark (body[data-host="pptb"]) from the same file the web resource and
 * XrmToolBox ship.
 *
 * Run:  node build.js   (or npm run build)
 */
const fs = require("fs");
const path = require("path");

const root = __dirname;
const dist = path.join(root, "dist");
// prefer an in-repo copy if present; otherwise the canonical web resource
const localHtml = path.join(root, "index.src.html");
const srcHtml = fs.existsSync(localHtml)
  ? localHtml
  : path.join(root, "..", "webresource", "prx3_FunctionalLocationMerge.html");

// icon file name must match the "icon" field in package.json (named after the tool)
const ICON = "Functional Location De-duplicator.svg";
// the shared Fluent 2 stylesheet. index.html inlines its own copy of these tokens (it must
// stay a single self-contained file with no external fetches), but the sheet ships with the
// dist so the tool carries the same source of truth the D365 web resource uses.
const CSS = "prx3_flmerge.css";
const cssSrc = path.join(root, "..", "webresource", CSS);

fs.mkdirSync(dist, { recursive: true });
const html = fs.readFileSync(srcHtml, "utf8");
fs.writeFileSync(path.join(dist, "index.html"), html, "utf8");
fs.copyFileSync(path.join(root, ICON), path.join(dist, ICON));
fs.copyFileSync(cssSrc, path.join(dist, CSS));

console.log("Built dist/ from", path.relative(root, srcHtml));
console.log("  dist/index.html, dist/" + ICON + ", dist/" + CSS);
