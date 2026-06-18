# Functional Location De-duplicator — Power Platform ToolBox tool

*by Mark Christie*

Merge duplicate **Functional Locations** (`msdyn_functionallocation`) in Dynamics 365 Field
Service onto a single **master (survivor)** record — reallocating every linked record onto the
master, verifying, then deactivating or deleting the duplicates.

This is the [Power Platform ToolBox](https://docs.powerplatformtoolbox.com/) packaging of a
single dual-mode HTML app that also runs as a Dataverse **web resource** and inside
**XrmToolBox**. It auto-detects the host (`const PPTB = !!window.dataverseAPI`): inside ToolBox
all Dataverse calls go through `window.dataverseAPI` and the active `toolboxAPI` connection —
the tool never handles tokens.

---

## Why this tool exists

Dataverse's native **Merge** message only supports `account`, `contact`, `lead` and `incident`.
Functional Location is **not** mergeable that way. So a "merge" here means: pick a master,
**reallocate every record that references each duplicate** onto the master, confirm nothing
still points at the duplicate, then retire the duplicate. Relationships are discovered from
metadata at runtime, so custom (`prx3_`) lookups are handled automatically; platform-managed
system relationships (async operations, sync errors, duplicate detection, etc.) are excluded.

## What it does, in order

1. **Connect** — uses the active ToolBox connection (no token handling).
2. **Match key** — choose the fields that define a duplicate. Default **Street 1
   (`msdyn_address1`) + Postcode (`msdyn_postalcode`)**; optionally add a third field (e.g.
   Name) for a tighter, higher-confidence set. A record is only considered when **every** match
   field is populated (a blank match field is skipped — never merge on a blank postcode).
3. **Relationships** — tick which related tables are counted, reallocated and verified. Default
   **Account, Work Order, Agreement**; add more (assets, property logs, warranty claims, …).
   Fewer relationships = faster.
4. **Search (optional)** — limit the scan to records whose Name / Address Line 1 / Post Code
   *contains* a term (applied server-side).
5. **Duplicate groups to return** — cap how many groups come back (10 / 100 / 1000 / 5000 /
   All), largest first.
6. **Scan (read-only)** — Dataverse finds the duplicate keys via a server-side `groupby`
   aggregate; the tool then fetches just those groups and scores each record. Nothing is
   written.
7. **Review the dry-run** — one row per record under each group, sorted by **Master %**.
8. **Choose the action** — **Deactivate** (default, reversible) or **Delete**.
9. **Reallocate & merge** — for every non-master in each ticked group: reallocate all linked
   records (of the ticked relationships) onto the master, **re-verify the duplicate has zero
   remaining references**, then deactivate/delete it. A duplicate that still has references is
   **skipped**, not forced.
10. **Result** — a survivor list with a clickable link to each kept record and its **Before**
    (combined group count) vs **After** (live re-count) references. A full change log is
    downloadable.

## The Master % score

Each record is scored 0–100 and the **highest score becomes the master**:

| Component | Weight | Meaning |
|---|---|---|
| Completeness | **45%** | populated fields ÷ total fields on the record |
| References | **35%** | how many linked records it has, relative to the group |
| Age | **20%** | older `createdon` scores higher (more likely the original) |

Rows are sorted by score (master starred at the top). You can override the master with the
radio button on any row. Oversized groups (> 25 records) skip scoring for speed — tick the
group to count and score it on demand.

## Safety

- **Scan and the dry-run are 100% read-only.** Writes happen only after you confirm the dialog.
- **Deactivate** sets `statecode = 1` (Inactive) — fully reversible (reactivate the record).
- **Delete** is permanent and is skipped automatically if any reference still remains.
- Every action is recorded in a downloadable change log.
- **Always run against a sandbox first.**

## Theme

Follows the OS / ToolBox light or dark theme automatically (`prefers-color-scheme`).

---

## Build & load (development)
```bash
cd pptb
npm run build          # copies the shared HTML + icon into dist/
```
Then in ToolBox → **Settings → enable Debug Menu → Debug → Browse** → select this `pptb`
folder. Reopen the tool tab after each rebuild.

## Publish
```bash
npm run build
npm publish --access public
```
Then submit via the Tool Submission Form at https://www.powerplatformtoolbox.com/. The published
tarball contains `dist/index.html` + `dist/icon.svg` (see the `files` allowlist).

> **Single source of truth:** the UI lives in `../webresource/prx3_FunctionalLocationMerge.html`.
> `build.js` copies it into `dist/`. Edit that one file and rebuild to keep all hosts in line.
