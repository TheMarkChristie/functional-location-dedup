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
| Power Platform ToolBox | **Dark** (injected by `build.js`) | `window.dataverseAPI` |
| XrmToolBox (WebView2 plugin) | **Windows 95** (injected by `../../xrmtoolbox/skin-win95.js`) | injected token + `fetch` |
| D365 web resource / standalone | Light | same-origin `fetch` |

There is no bundler and no runtime CDN (CSP-friendly). Each host build is **generated** from
the one canonical file by swapping only the `<style>` block:

- `pptb/build.js` → copies the canonical HTML into `pptb/dist/index.html` and injects the dark
  theme (`color-scheme: dark` + dark design tokens), plus copies the icon.
- `xrmtoolbox/skin-win95.js` → copies the canonical HTML and swaps in the Windows 95 stylesheet,
  writing `xrmtoolbox/FunctionalLocationMerge/app/index.html` (bundled into the plugin).

Edit the canonical file, then rebuild PPTB (`node build.js`) and the XTB skin, and redeploy the
web resource — all three stay in lockstep.

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
- `build.js` — assembles `dist/` (dark HTML + icon).
- `Functional Location De-duplicator.svg` — tool icon.
- `dist/` — generated; what ToolBox loads.
