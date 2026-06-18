# Functional Location De-duplicator

> One dual-mode HTML app, **three hosts**. Finds duplicate **Functional Locations**
> (matched on **Street 1 + Postcode**, optionally + Name), scores each record, reallocates
> every linked record onto the highest-scoring **survivor**, verifies, then **deactivates or
> deletes** the duplicates.

Built for the customer sandbox `https://org1d1cdc26.crm4.dynamics.com/`.

## Why "reallocate then deactivate/delete" (not Merge)

Dataverse's native **Merge** only supports account / contact / lead / incident —
`msdyn_functionallocation` is **not** mergeable. So this tool discovers every relationship
that references FL from metadata, reallocates the loser's linked records onto the survivor,
verifies zero remain, then deactivates (default, reversible) or deletes the duplicate.

## One source, three hosts

The single file [`webresource/prx3_FunctionalLocationMerge.html`](webresource/prx3_FunctionalLocationMerge.html)
is **dual-mode** (`const PPTB = !!window.dataverseAPI`) and auto-detects its host:

| Deliverable | Host | Data access |
|---|---|---|
| **1. Web resource** | D365 model-driven app | same-origin `fetch` (logged-in user / token) |
| **2. XrmToolBox tool** | `xrmtoolbox/` C# WebView2 plugin | injected token + `fetch` |
| **3. Power Platform ToolBox** | `pptb/` package | `window.dataverseAPI` (queryData / update / delete / associate) |

All three load the **same HTML** — XrmToolBox hosts it in WebView2, and `pptb/build.js`
copies it into `pptb/dist/index.html`. Update the one file and rebuild/redeploy.

## Master % score

Each record is scored 0–100: **45% completeness** (populated fields ÷ total fields) +
**35% references** (linked records, relative to the group) + **20% age** (older = more
original). Highest score is auto-selected as the survivor; rows are sorted by score and are
clickable (open the record). Override the survivor with the radio if needed.

## Key behaviours
- Match requires **Street 1 AND Postcode** populated (blank → skipped).
- **Relationship picker** (default Account / Work Order / Agreement) controls what is counted,
  reallocated and verified — fewer = faster.
- **Search** (Name / Address Line 1 / Post Code) narrows the scan server-side.
- **Duplicate groups to return** caps how many groups come back (largest first).
- Oversized groups (>25) are auto-excluded; tick to count & score on demand.
- System relationships (asyncoperation, syncerror, duplicaterecord, …) are denylisted.
- Scan + dry-run are read-only; writes only after the confirm dialog. Change log downloadable.

## Folders
- `webresource/` — the single dual-mode HTML (the source of truth).
- `xrmtoolbox/` — C# WebView2 plugin hosting that HTML (deliverable 2).
- `pptb/` — Power Platform ToolBox package + `build.js` (deliverable 3).
- `_discover/` — PowerShell discovery + deploy scripts (device-code token).

---

## Deploy A — D365 web resource
`_discover/deploy.ps1` (or inline) PATCHes `prx3_FunctionalLocationMerge` and publishes.
Open: `https://org1d1cdc26.crm4.dynamics.com/WebResources/prx3_FunctionalLocationMerge`.

## Deploy B — XrmToolBox
Build `xrmtoolbox/FunctionalLocationMerge` (.NET Framework 4.8, WebView2 runtime). The build
copies the web resource HTML to `app/index.html`. Drop the output into
`%APPDATA%\MscrmTools\XrmToolBox\Plugins\`. Connect with an **OAuth** connection.

## Deploy C — Power Platform ToolBox
```bash
cd pptb && npm run build      # copies the HTML + icon into dist/
```
ToolBox → Settings → enable Debug Menu → Debug → Browse → select `pptb/`. Publish via
`npm publish --access public` + the Tool Submission Form.

## Safety
Scan/dry-run are read-only. Deactivate is reversible (reactivate the record); delete is not.
Run against the **sandbox** first; per-loser the tool re-verifies zero references before acting.
