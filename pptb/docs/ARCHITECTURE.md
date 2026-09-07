# Architecture — Functional Location De-duplicator

*by Mark Christie*

## One source, three hosts

The entire tool is **one self-contained HTML file** (logic + markup), kept canonical at
`../../webresource/prx3_FunctionalLocationMerge.html`. It runs unchanged in three hosts and
detects which one it's in at runtime:

```js
const PPTB = !!window.dataverseAPI;   // Power Platform ToolBox
// XrmToolBox WebView2 injects window.XTB_CONFIG = { baseUrl, token }
// else: D365 web resource / standalone (same-origin fetch)
```

| Host | Theme | Data access |
|------|-------|-------------|
| Power Platform ToolBox | **Fluent 2 dark** (`body[data-host="pptb"]`) | `window.dataverseAPI` |
| XrmToolBox (WebView2 plugin) | **Fluent 2 light** (`body[data-host="xtb"]`) | injected token + `fetch` |
| D365 web resource / standalone | **Fluent 2 light** (`body[data-host="web"]`) | same-origin `fetch` |

There is no bundler and no runtime CDN (CSP-friendly), and **no build-time skinning**. Every
host ships the identical file; it sets `body[data-host]` at runtime and its Fluent 2 token
block carries a palette for each host.

- `pptb/build.js` → copies the canonical HTML into `pptb/dist/index.html`, plus the icon and
  the shared `prx3_flmerge.css`.
- `xrmtoolbox/build-app.js` → copies the canonical HTML to
  `xrmtoolbox/FunctionalLocationMerge/app/functional-location-dedup.html` (bundled into the
  plugin). The name is deliberately unique — every plugin dll installs flat into `Plugins`, so
  all WebView2 tools share one `Plugins\app` folder and a generic `index.html` there is
  overwritten by whichever tool installs last.

Edit the canonical file, then rebuild PPTB (`node build.js`) and the XTB app (`node
build-app.js`), and redeploy the web resource — all three stay in lockstep.

## Data layer (host-agnostic)

A thin adapter exposes `get / getAll / count / updateRec / deleteRec / nnAssoc / nnDisassoc`.
- **PPTB**: `dataverseAPI.queryData` for reads; `update` / `delete` / `associate` /
  `disassociate` for writes.
- **Web resource / XTB**: same-origin (or bearer-token) `fetch` against the Web API.

Functional Location has **no native Dataverse Merge**, so "merge" = reallocate every record
referencing a duplicate onto the master, verify zero references remain, then deactivate/delete.
Reference relationships are discovered from metadata at runtime; platform-managed system
relationships are denylisted.

## Master % score

`0.45 × completeness + 0.35 × references + 0.20 × age`, where completeness = populated fields ÷
total fields, references = linked records relative to the group, age favours the oldest record.
Highest score becomes the master; rows are sorted by score.

## Accessibility

WCAG 2.1 AA in every theme: associated labels, `scope` headers, live regions, dialog semantics
with Esc/focus management, visible focus per theme, AA contrast, and `prefers-reduced-motion`
handling. See the AccessibilityStandards pass in the project README.

## Files

- `package.json` — PPTB manifest (`main`/`icon` relative to `dist`, Mark as author).
- `build.js` — assembles `dist/` (the shared HTML + icon + stylesheet; no skinning step).
- `Functional Location De-duplicator.svg` — tool icon.
- `dist/` — generated; what ToolBox loads.
