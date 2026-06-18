# Publishing — Functional Location De-duplicator

Two tools to publish, both authored by **Mark Christie**. They share the one HTML UI but ship
through different channels:

- **XrmToolBox** → NuGet package → XrmToolBox **Tool Library**
- **Power Platform ToolBox (PPTB)** → npm → PPTB **Tool Registry**

> **Shared prerequisite — a public GitHub repo.** Both listings reference
> `https://github.com/TheMarkChristie/functional-location-dedup` (project URL, README URL, and
> the XTB `iconUrl` → `…/main/icon.png`). Create that repo and push this project first, and make
> sure `icon.png` exists at the repo root (copy `xrmtoolbox/icon.png`). Without it the XTB tile
> icon and the PPTB readme link will 404.

---

## A. XrmToolBox → Tool Library

**Prerequisites:** a [nuget.org](https://www.nuget.org) account + API key; `nuget.exe` on PATH
(or use NuGet Package Explorer); the GitHub repo above (for `projectUrl` + `iconUrl`).

**Rule:** the NuGet `version` must **exactly** match the assembly version. Here both are
`1.0.0` (assembly `1.0.0.0`). Bump them together for future releases (csproj `<Version>` +
`.nuspec` `<version>`).

1. **Build Release** (bundles the Win95 HTML into `app\index.html`):
   ```powershell
   cd C:\PCF\FunctionalLocationMerge\xrmtoolbox\FunctionalLocationMerge
   dotnet build -c Release
   ```
2. **Pack the NuGet** from the custom nuspec (ships only our DLL + `app\index.html` into a
   `Plugins` folder — XrmToolBox already provides WebView2 and the Dataverse SDK):
   ```powershell
   nuget pack FunctionalLocationMerge.nuspec -OutputDirectory ..\..\_dist
   ```
   Produces `MarkChristie.FunctionalLocationDeduplicator.1.0.0.nupkg`.
   *(Optional sanity check: open the .nupkg in NuGet Package Explorer — confirm it contains
   `Plugins\FunctionalLocationMerge.dll` + `Plugins\app\index.html`, the `XrmToolBox`
   dependency, the `XrmToolBox` tag, author/owner = Mark Christie, and a working `iconUrl`.)*
3. **Push to nuget.org** and wait for it to index (a few minutes):
   ```powershell
   nuget push ..\..\_dist\MarkChristie.FunctionalLocationDeduplicator.1.0.0.nupkg -ApiKey <YOUR_NUGET_KEY> -Source https://api.nuget.org/v3/index.json
   ```
4. **Register** the package id at **https://www.xrmtoolbox.com/plugins/new/** — paste
   `MarkChristie.FunctionalLocationDeduplicator`. The portal reads the metadata; an XrmToolBox
   admin validates it (can take a few days). Only validated tools appear in the Tool Library.

**Updating later:** bump csproj `<Version>` + nuspec `<version>` together → `dotnet build -c
Release` → `nuget pack` → `nuget push`. The Tool Library picks up the new version automatically.

---

## B. Power Platform ToolBox → Tool Registry

**Prerequisites:** an [npmjs.com](https://www.npmjs.com) account; Node 18+; the GitHub repo
above; a PPTB account for the submission form.

1. **Confirm the npm name is free** (manifest uses `functional-location-dedup`):
   ```powershell
   npm view functional-location-dedup
   ```
   "404 / not found" = available. If taken, change `name` in `pptb/package.json` (e.g.
   `@themarkchristie/functional-location-dedup`).
2. **Build** the dark `dist/`:
   ```powershell
   cd C:\PCF\FunctionalLocationMerge\pptb
   node build.js
   ```
   Verify `dist/` has `index.html` and `Functional Location De-duplicator.svg`.
3. **Validate** (fix every error before publishing):
   ```powershell
   npx pptb-validate
   ```
4. **Publish to npm:**
   ```powershell
   npm login
   npm publish --access public
   npm view functional-location-dedup   # confirm it's live
   ```
   *(Scoped names need `--access public`; unscoped are public anyway.)*
5. **Test the published version:** in ToolBox → Debug → **Install from npm** → enter the
   package name → run it.
6. **Submit to the registry:** **https://www.powerplatformtoolbox.com/submit-tool** (login),
   give the npm package name, pick **up to 3** categories (suggested: **Data**, **Migration**,
   **Troubleshooting**). Maintainers review in ~48–72 hours.

**Updating later:** `npm version patch|minor|major` in `pptb/` → `node build.js` →
`npm publish`. The registry syncs the new version.

---

## C. (Optional) D365 web resource
Not a public "publish" — it's deployed into the customer environment as the
`prx3_FunctionalLocationMerge` web resource (see `_discover/deploy.ps1`). Keep it in sync by
re-running the deploy whenever the canonical HTML changes.
