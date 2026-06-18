# Functional Location De-duplicator — XrmToolBox plugin

*by Mark Christie*

Merge duplicate **Functional Locations** (`msdyn_functionallocation`) in Dynamics 365 Field
Service onto a single **master (survivor)** record — reallocating every linked record onto the
master, verifying, then deactivating or deleting the duplicates.

This XrmToolBox plugin is a thin **WebView2 host** around the same dual-mode HTML used by the
Dataverse web resource and the Power Platform ToolBox tool. The plugin reads the active
XrmToolBox connection, gets its OAuth access token + web API URL, and injects them into the page
(`window.XTB_CONFIG`); the page then calls the Dataverse Web API directly. One UI, three hosts.

---

## Why this tool exists

Dataverse's native **Merge** message only supports `account`, `contact`, `lead` and `incident`.
Functional Location is **not** mergeable that way. So a "merge" here means: pick a master,
**reallocate every record that references each duplicate** onto the master, confirm nothing
still points at the duplicate, then retire the duplicate. Relationships are discovered from
metadata at runtime, so custom (`prx3_`) lookups are handled automatically; platform-managed
system relationships are excluded.

## What it does, in order

1. **Connect** in XrmToolBox (use an **OAuth/MFA** connection so a token is available). The
   plugin injects the connection's URL + token into the embedded page.
2. **Match key** — default **Street 1 (`msdyn_address1`) + Postcode (`msdyn_postalcode`)**;
   optional third field (e.g. Name). A record is considered only when **every** match field is
   populated.
3. **Relationships** — tick which related tables are counted, reallocated and verified. Default
   **Account, Work Order, Agreement**.
4. **Search (optional)** — limit the scan to Name / Address Line 1 / Post Code *contains* a term.
5. **Duplicate groups to return** — cap how many groups (10 / 100 / 1000 / 5000 / All), largest
   first.
6. **Scan (read-only)** — server-side `groupby` finds duplicate keys; the tool fetches just those
   groups and scores each record.
7. **Review the dry-run** — one row per record under each group, sorted by **Master %**.
8. **Choose the action** — **Deactivate** (default, reversible) or **Delete**.
9. **Reallocate & merge** — for each non-master: reallocate all linked records (of the ticked
   relationships) onto the master, **re-verify zero remaining references**, then deactivate/
   delete. Duplicates that still have references are skipped.
10. **Result** — survivor list with clickable record links and **Before vs After** reference
    counts; downloadable change log.

## The Master % score

Highest score becomes the master: **45% completeness** (populated fields ÷ total fields) +
**35% references** (relative to the group) + **20% age** (older = higher). Rows are sorted by
score; override the master with the radio on any row. Oversized groups (> 25) score on demand
when ticked.

## Safety

- Scan + dry-run are read-only; writes only after the confirm dialog.
- **Deactivate** (`statecode = 1`) is reversible; **Delete** is permanent and skipped if any
  reference remains.
- Run against a **sandbox** first. Full change log downloadable.

## Theme

Follows the OS theme (light/dark) automatically.

---

## Build
Requires the .NET Framework 4.8 developer pack. Targets `XrmToolBoxPackage` 1.2025.7.71 and
`Microsoft.Web.WebView2`. The build bundles the shared HTML to `app\index.html`.
```powershell
cd FunctionalLocationMerge
dotnet build -c Release
```

## Install
Run [`install.ps1`](install.ps1) — it copies `FunctionalLocationMerge.dll` + `app\index.html`
into `%APPDATA%\MscrmTools\XrmToolBox\Plugins\` (XrmToolBox already ships WebView2 and the
Dataverse SDK, so only those two files are copied to avoid version conflicts). Restart
XrmToolBox → open **Functional Location De-duplicator** → connect with an OAuth connection.

To update: rebuild, re-run `install.ps1`, restart XrmToolBox.

## Technical notes

- Plugin entry: `FunctionalLocationMergePlugin` (`IXrmToolBoxPlugin` via MEF `Export` +
  `ExportMetadata`).
- UI host: `MergeControl : PluginControlBase`, overriding
  `UpdateConnection(IOrganizationService, ConnectionDetail, string, object)`; reads
  `ConnectionDetail.WebApplicationUrl` and `ConnectionDetail.ServiceClient.CurrentAccessToken`,
  then `AddScriptToExecuteOnDocumentCreatedAsync` sets `window.XTB_CONFIG = { baseUrl, token }`
  before navigating WebView2 to `app/index.html`.

> **Single source of truth:** the UI lives in
> `..\webresource\prx3_FunctionalLocationMerge.html`; the `.csproj` copies it to
> `app\index.html` on build. Edit that one file to keep all hosts in line.
