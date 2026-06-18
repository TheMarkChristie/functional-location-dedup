/**
 * Generates the XrmToolBox-only Windows 95 skin of the tool.
 *
 * Logic + markup come from the canonical web resource
 *   ../webresource/prx3_FunctionalLocationMerge.html
 * and ONLY the <style> block is swapped for a Windows 95 stylesheet, so the
 * XrmToolBox build stays in sync with the shared logic while looking like Win95.
 * The web resource and PPTB keep their own (modern) look.
 *
 * Output: FunctionalLocationMerge/app/index.html  (bundled into the plugin by the .csproj)
 * Run:    node skin-win95.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname);
const src = path.join(root, "..", "webresource", "prx3_FunctionalLocationMerge.html");
const outDir = path.join(root, "FunctionalLocationMerge", "app");
const out = path.join(outDir, "index.html");

const WIN95 = `
  /* ===== Windows 95 skin (XrmToolBox host) ===== */
  *{box-sizing:border-box}
  .hidden{display:none}
  .byline{color:#000080;font-weight:bold;font-size:13px;margin:-6px 0 10px}
  @media (prefers-reduced-motion: reduce){*{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}
  :focus-visible{outline:2px dotted #000;outline-offset:2px}
  button:focus-visible{outline:1px dotted #000;outline-offset:-5px}
  html,body{height:100%}
  body{margin:0;background:#008080;color:#000;font-family:"MS Sans Serif","Tahoma","Segoe UI",sans-serif;font-size:14px}
  .wrap{max-width:none;width:100%;min-height:100%;margin:0;padding:14px}
  .mono{font-family:"Courier New",monospace;font-size:13px}
  .muted{color:#404040}
  h1{font-size:20px;font-weight:bold;color:#fff;background:linear-gradient(90deg,#000080,#1084d0);
     margin:0 0 12px;padding:6px 10px;border:2px outset #c0c0c0}
  h2{font-size:15px;font-weight:bold;color:#fff;background:#000080;margin:-8px -8px 12px;padding:4px 8px}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
  .spaced{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
  .card{background:#c0c0c0;border:2px outset #c0c0c0;padding:10px;margin-bottom:14px}
  .card .desc{color:#000;margin:2px 0 10px}
  .field{display:flex;flex-direction:column;gap:4px;min-width:240px;flex:1 1 240px}
  .field>label{font-weight:bold}
  .field .hint{color:#404040}
  input[type=text],textarea,select{font:inherit;padding:4px 6px;background:#fff;color:#000;border:2px inset #c0c0c0;border-radius:0;width:100%}
  input[type=checkbox],input[type=radio]{accent-color:#000080;width:16px;height:16px}
  button{font:inherit;cursor:pointer;background:#c0c0c0;color:#000;border:2px outset #c0c0c0;border-radius:0;padding:6px 16px;min-width:90px}
  button:active:not(:disabled){border-style:inset}
  button:disabled{color:#808080}
  button.primary{font-weight:bold}
  button.subtle{min-width:0}
  .badge{display:inline-block;padding:1px 6px;margin-right:6px;background:#c0c0c0;color:#000;border:1px solid #808080;border-radius:0;font-weight:bold}
  .badge.brand{background:#000080;color:#fff;border-color:#000}
  .badge.warn{background:#fcfca8;color:#000;border-color:#808000}
  .badge.danger{background:#ff8080;color:#000;border-color:#800000}
  .badge.ok{background:#80ff80;color:#000;border-color:#008000}
  .badge.sm{font-size:10px;padding:0 4px;margin-top:3px}
  .bar{margin:8px 0;padding:6px 8px;background:#fff;border:2px inset #c0c0c0}
  .bar.info{background:#fff}.bar.ok{background:#dfffdf}.bar.warn{background:#fffbe0}.bar.error{background:#ffe0e0}
  .bar b{display:block}
  .prog{height:18px;background:#fff;border:2px inset #c0c0c0;overflow:hidden;margin-top:3px}
  .prog>i{display:block;height:100%;background:#000080;width:0}
  .prog.indet>i{width:30%;background:repeating-linear-gradient(90deg,#000080 0 10px,#1084d0 10px 20px);animation:indet 1.1s linear infinite}
  @keyframes indet{0%{margin-left:-30%}100%{margin-left:100%}}
  .loader{display:flex;gap:10px;align-items:center;background:#c0c0c0;border:2px outset #c0c0c0;padding:8px;margin:8px 0}
  .loader .lmain{font-weight:bold}.loader .lsub{color:#404040}
  .spinner{width:18px;height:18px;border:2px solid #fff;border-top-color:#000080;border-radius:50%;animation:spin .8s linear infinite;flex:none}
  @keyframes spin{to{transform:rotate(360deg)}}
  table{border-collapse:collapse;width:100%;font-size:13px;background:#fff}
  th,td{text-align:left;padding:4px 7px;border:1px solid #c0c0c0;vertical-align:top}
  th{font-weight:bold;background:#c0c0c0;border:2px outset #c0c0c0;position:sticky;top:0}
  .scroll{max-height:62vh;overflow:auto;border:2px inset #c0c0c0;background:#fff}
  .num{text-align:right}
  tr.grp td{background:#000080;color:#fff;font-weight:bold}
  tr.grp td .badge{background:#ff8080}
  tr.sv td{background:#ffffc0}
  td .star{color:#008000;font-weight:bold}
  a.link,a{color:#0000ff;cursor:pointer;text-decoration:underline;font-size:13px}
  #detailBody td:first-child{font-family:"Courier New",monospace;color:#000080;white-space:nowrap}
  .log{white-space:pre-wrap;max-height:220px;overflow:auto;background:#000;color:#00ff00;padding:6px;border:2px inset #c0c0c0;font-family:"Courier New",monospace}
  .backdrop{position:fixed;inset:0;background:rgba(0,0,128,.25);display:flex;align-items:center;justify-content:center;z-index:50}
  .modal{background:#c0c0c0;border:2px outset #c0c0c0;max-width:520px;padding:0;box-shadow:2px 2px 0 #000}
  .modal h3{margin:0;background:linear-gradient(90deg,#000080,#1084d0);color:#fff;padding:3px 6px;font-size:11px}
  .modal>div:not(.acts){padding:10px}
  .modal .acts{display:flex;gap:6px;justify-content:flex-end;padding:0 10px 10px}
  .boot{padding:16px}
  .hidden{display:none}
`;

let html = fs.readFileSync(src, "utf8");
if (!/<style>[\s\S]*?<\/style>/.test(html)) throw new Error("No <style> block found in canonical HTML.");
html = html.replace(/<style>[\s\S]*?<\/style>/, "<style>" + WIN95 + "</style>");
// tag the build so it's identifiable
html = html.replace("<title>", "<!-- Windows 95 skin (XrmToolBox) - generated by skin-win95.js -->\n<title>");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, html, "utf8");
console.log("Win95 skin written ->", path.relative(root, out), "(" + html.length + " bytes)");
