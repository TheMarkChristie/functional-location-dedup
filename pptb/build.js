/**
 * Assembles the Power Platform ToolBox distribution into ./dist.
 * PPTB loads `main` (index.html) and `icon` relative to the dist root.
 *
 * SINGLE SOURCE OF TRUTH: the tool UI is the dual-mode web resource
 *   ../webresource/prx3_FunctionalLocationMerge.html
 * It uses window.dataverseAPI when running inside ToolBox, and same-origin fetch
 * when served as a Dataverse web resource / XrmToolBox WebView2. This script just
 * copies that one file (+ icon) into dist/ so all hosts stay in line.
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

// PPTB tool is always DARK (web resource stays light; XrmToolBox is Win95).
const DARK = `
  :root{color-scheme:dark;--bg:#1b1a19;--card:#252423;--line:#3b3a39;--line2:#323130;--ink:#f3f2f1;--ink2:#a19f9d;
    --brand:#479ef5;--brand-d:#2886de;--warn:#ffd279;--warn-bg:#3a2f10;--danger:#ff909a;--danger-bg:#3a1d20;
    --ok:#92e892;--ok-bg:#13310f;--info-bg:#102a3f;--shadow:0 1.6px 3.6px rgba(0,0,0,.4),0 .3px .9px rgba(0,0,0,.3);}
  input[type=text],textarea,select{background:#1f1e1d;color:#f3f2f1;border-color:#605e5c}
  button{background:#2f2e2d;color:#f3f2f1;border-color:#605e5c}
  button:hover:not(:disabled){background:#3b3a39}
  button.subtle{background:transparent;color:#479ef5}
  tr.grp td{background:#10243a;border-top-color:#23456a}
  tr.sv td{background:#13280f}
  td .star{color:#92e892}
  .modal{background:#252423}
  th{background:#252423}`;

fs.mkdirSync(dist, { recursive: true });
let html = fs.readFileSync(srcHtml, "utf8");
html = html.replace("</head>", "<style>/* PPTB dark theme */" + DARK + "</style>\n</head>");
fs.writeFileSync(path.join(dist, "index.html"), html, "utf8");
fs.copyFileSync(path.join(root, ICON), path.join(dist, ICON));

console.log("Built dist/ (dark) from", path.relative(root, srcHtml));
console.log("  dist/index.html, dist/" + ICON);
