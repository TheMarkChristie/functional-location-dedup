/* Functional Location De-duplicator — app logic + UI.
   CSP-safe: uses globals React, ReactDOM, htm (loaded as same-origin web resources).
   No external requests, no Fluent (no UMD build exists for v9). */
(function () {
  'use strict';
  var React = window.React, ReactDOM = window.ReactDOM;
  var useState = React.useState, useEffect = React.useEffect, useCallback = React.useCallback,
      useMemo = React.useMemo, useRef = React.useRef;
  var html = window.htm.bind(React.createElement);

  var FL_SET = 'msdyn_functionallocations';
  var FL_ENTITY = 'msdyn_functionallocation';
  var API_VER = 'v9.2';

  // Platform-managed relationships that must NOT be reallocated (cascade-managed; PATCH
  // would fail and they'd inflate ref counts so the pre-delete zero-check never passes).
  var SYSTEM_DENY = new Set([
    'asyncoperation', 'bulkdeletefailure', 'bulkdeleteoperation', 'mailboxtrackingfolder',
    'processsession', 'syncerror', 'duplicaterecord', 'deleteditemreference',
    'principalobjectattributeaccess', 'userentityinstancedata'
  ]);
  // 'annotation' (notes) deliberately kept -> notes move to survivor.
  var MAX_AUTO_INCLUDE = 25; // bigger groups auto-excluded (likely complexes sharing a postcode)

  /* ---------------- connection ---------------- */
  function detectXrm() {
    try { if (window.Xrm && window.Xrm.Utility) return window.Xrm; } catch (e) {}
    try { if (window.parent && window.parent.Xrm && window.parent.Xrm.Utility) return window.parent.Xrm; } catch (e) {}
    return null;
  }
  function makeConn() {
    var xrm = detectXrm();
    if (xrm) {
      var base = xrm.Utility.getGlobalContext().getClientUrl().replace(/\/+$/, '');
      return { mode: 'D365 (same-origin)', baseUrl: base, token: null, ready: true };
    }
    if (window.XTB_CONFIG && window.XTB_CONFIG.baseUrl) {
      return { mode: 'XrmToolBox (WebView2)', baseUrl: String(window.XTB_CONFIG.baseUrl).replace(/\/+$/, ''),
               token: window.XTB_CONFIG.token || null, ready: true };
    }
    return { mode: 'Not connected', baseUrl: '', token: null, ready: false };
  }
  function makeApi(conn) {
    var root = conn.baseUrl + '/api/data/' + API_VER + '/';
    var creds = conn.token ? 'omit' : 'include';
    function headers(extra) {
      var h = { 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', 'Accept': 'application/json',
                'Content-Type': 'application/json; charset=utf-8' };
      if (extra) for (var k in extra) h[k] = extra[k];
      if (conn.token) h['Authorization'] = 'Bearer ' + conn.token;
      return h;
    }
    async function req(method, path, body, extraHeaders) {
      var url = path.indexOf('http') === 0 ? path : root + path;
      var opts = { method: method, headers: headers(extraHeaders), credentials: creds };
      if (body !== undefined) opts.body = JSON.stringify(body);
      var res = await fetch(url, opts);
      if (!res.ok) {
        var detail = '';
        try { detail = (await res.json()).error.message; } catch (e) { try { detail = await res.text(); } catch (e2) {} }
        throw new Error(method + ' ' + path.split('?')[0] + ' → ' + res.status + ' ' + res.statusText + (detail ? ': ' + detail : ''));
      }
      if (res.status === 204) return null;
      var txt = await res.text();
      return txt ? JSON.parse(txt) : null;
    }
    async function getAll(path, onPage) {
      var url = path, out = [];
      while (url) {
        var page = await req('GET', url);
        out = out.concat(page.value || []);
        if (onPage) onPage(out.length);
        url = page['@odata.nextLink'] || null;
      }
      return out;
    }
    return {
      root: root,
      get: function (p) { return req('GET', p); },
      getAll: getAll,
      patch: function (p, b) { return req('PATCH', p, b); },
      del: function (p) { return req('DELETE', p); },
      post: function (p, b) { return req('POST', p, b); },
      count: async function (path) {
        var r = await req('GET', path + (path.indexOf('?') >= 0 ? '&' : '?') + '$count=true&$top=1');
        return (r['@odata.count'] != null) ? r['@odata.count'] : (r.value ? r.value.length : 0);
      }
    };
  }

  async function mapLimit(items, limit, fn, onProgress) {
    var out = new Array(items.length), i = 0, done = 0;
    async function worker() {
      while (i < items.length) {
        var idx = i++;
        out[idx] = await fn(items[idx], idx);
        done++; if (onProgress) onProgress(done, items.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }
  function norm(v) { return (v == null ? '' : String(v)).trim().toLowerCase().replace(/\s+/g, ' '); }

  /* ---------------- metadata ---------------- */
  async function loadMetadata(api) {
    var ents = await api.getAll('EntityDefinitions?$select=LogicalName,EntitySetName,PrimaryIdAttribute,DisplayName');
    var entMap = {}; ents.forEach(function (e) { entMap[e.LogicalName] = e; });

    var attrs = await api.getAll("EntityDefinitions(LogicalName='" + FL_ENTITY + "')/Attributes?" +
      "$select=LogicalName,AttributeType,DisplayName&$filter=(AttributeType eq 'String' or AttributeType eq 'Memo')");
    var fields = attrs.map(function (a) {
      return { logical: a.LogicalName, label: (a.DisplayName && a.DisplayName.UserLocalizedLabel && a.DisplayName.UserLocalizedLabel.Label) || a.LogicalName };
    }).sort(function (a, b) { return a.logical.localeCompare(b.logical); });

    var def = await api.get("EntityDefinitions(LogicalName='" + FL_ENTITY + "')?$select=LogicalName&" +
      "$expand=OneToManyRelationships($select=ReferencingEntity,ReferencingAttribute,ReferencingEntityNavigationPropertyName,SchemaName)," +
      "ManyToManyRelationships($select=SchemaName,Entity1LogicalName,Entity2LogicalName,Entity1NavigationPropertyName,Entity2NavigationPropertyName)");

    var oneToMany = (def.OneToManyRelationships || []).map(function (r) {
      var ce = entMap[r.ReferencingEntity] || {};
      return { kind: 'N1', schema: r.SchemaName, childEntity: r.ReferencingEntity, childSet: ce.EntitySetName,
               childIdAttr: ce.PrimaryIdAttribute, attr: r.ReferencingAttribute, nav: r.ReferencingEntityNavigationPropertyName,
               label: (ce.DisplayName && ce.DisplayName.UserLocalizedLabel && ce.DisplayName.UserLocalizedLabel.Label) || r.ReferencingEntity };
    }).filter(function (r) { return r.childSet && !SYSTEM_DENY.has(r.childEntity); });

    var manyToMany = (def.ManyToManyRelationships || []).map(function (r) {
      var flIsE1 = r.Entity1LogicalName === FL_ENTITY;
      var other = flIsE1 ? r.Entity2LogicalName : r.Entity1LogicalName;
      var oe = entMap[other] || {};
      return { kind: 'NN', schema: r.SchemaName, flNav: flIsE1 ? r.Entity1NavigationPropertyName : r.Entity2NavigationPropertyName,
               otherEntity: other, otherSet: oe.EntitySetName,
               label: (oe.DisplayName && oe.DisplayName.UserLocalizedLabel && oe.DisplayName.UserLocalizedLabel.Label) || other };
    }).filter(function (r) { return r.otherSet; });

    return { entMap: entMap, fields: fields, oneToMany: oneToMany, manyToMany: manyToMany };
  }

  async function countRefs(api, meta, flId) {
    var total = 0, byRel = {};
    for (var i = 0; i < meta.oneToMany.length; i++) {
      var r = meta.oneToMany[i];
      var n = await api.count(r.childSet + '?$filter=_' + r.attr + '_value eq ' + flId + '&$select=' + r.childIdAttr);
      byRel[r.schema] = n; total += n;
    }
    for (var j = 0; j < meta.manyToMany.length; j++) {
      var m = meta.manyToMany[j];
      var c = await api.count(FL_SET + '(' + flId + ')/' + m.flNav + '?$select=' + meta.entMap[m.otherEntity].PrimaryIdAttribute);
      byRel[m.schema] = c; total += c;
    }
    return { total: total, byRel: byRel };
  }

  async function reallocateN1(api, rel, loserId, survivorId, log) {
    var children = await api.getAll(rel.childSet + '?$select=' + rel.childIdAttr + '&$filter=_' + rel.attr + '_value eq ' + loserId);
    for (var i = 0; i < children.length; i++) {
      var cid = children[i][rel.childIdAttr], body = {};
      body[rel.nav + '@odata.bind'] = '/' + FL_SET + '(' + survivorId + ')';
      await api.patch(rel.childSet + '(' + cid + ')', body);
      log('   ↳ ' + rel.childEntity + ' ' + cid + ': ' + rel.attr + ' → survivor');
    }
    return children.length;
  }
  async function reallocateNN(api, rel, meta, loserId, survivorId, log) {
    var otherId = meta.entMap[rel.otherEntity].PrimaryIdAttribute;
    var related = await api.getAll(FL_SET + '(' + loserId + ')/' + rel.flNav + '?$select=' + otherId);
    for (var i = 0; i < related.length; i++) {
      var oid = related[i][otherId];
      try { await api.post(FL_SET + '(' + survivorId + ')/' + rel.flNav + '/$ref', { '@odata.id': api.root + rel.otherSet + '(' + oid + ')' }); }
      catch (e) { /* already associated */ }
      await api.del(FL_SET + '(' + loserId + ')/' + rel.flNav + '/$ref?$id=' + rel.otherSet + '(' + oid + ')');
      log('   ↳ N:N ' + rel.schema + ': ' + oid + ' moved to survivor');
    }
    return related.length;
  }

  /* ---------------- tiny UI kit (native elements) ---------------- */
  function Btn(p) { return html`<button className=${(p.primary ? 'primary' : p.subtle ? 'subtle' : '') } disabled=${p.disabled} onClick=${p.onClick}>${p.children}</button>`; }
  function Badge(p) { return html`<span className=${'badge ' + (p.c || '') + (p.sm ? ' sm' : '')}>${p.children}</span>`; }
  function Bar(p) { return html`<div className=${'bar ' + p.intent}>${p.children}</div>`; }
  function Field(p) { return html`<div className="field" style=${p.style}><label>${p.label}</label>${p.hint && html`<span className="hint">${p.hint}</span>`}${p.children}</div>`; }
  function Select(p) {
    return html`<select value=${p.value} onChange=${function (e) { p.onChange(e.target.value); }}>
      ${p.placeholder !== undefined && html`<option value="">${p.placeholder}</option>`}
      ${p.options.map(function (o) { return html`<option key=${o.value} value=${o.value}>${o.label}</option>`; })}
    </select>`;
  }
  function Progress(p) {
    var indet = (p.value == null);
    return html`<div className=${'prog' + (indet ? ' indet' : '')}><i style=${{ width: indet ? '' : (Math.round(p.value * 100) + '%') }}></i></div>`;
  }

  /* ---------------- connect panel ---------------- */
  function ConnectPanel(props) {
    var s = useState('https://org1d1cdc26.crm4.dynamics.com/'); var url = s[0], setUrl = s[1];
    var t = useState(''); var token = t[0], setToken = t[1];
    return html`<div className="card" style=${{ maxWidth: 640, margin: '40px auto' }}>
      <h2>Connect to Dataverse</h2>
      <div className="desc">No D365 host or XrmToolBox connection detected — enter an org URL and bearer token.</div>
      <${Field} label="Organization URL" style=${{ marginBottom: 12 }}>
        <input type="text" value=${url} onInput=${function (e) { setUrl(e.target.value); }} />
      <//>
      <${Field} label="Bearer token" hint="Hosted modes set this automatically." style=${{ marginBottom: 12 }}>
        <textarea rows=${3} className="mono" value=${token} onInput=${function (e) { setToken(e.target.value); }}></textarea>
      <//>
      <${Btn} primary disabled=${!url || !token} onClick=${function () {
        props.onConnect({ mode: 'Standalone (token)', baseUrl: url.replace(/\/+$/, ''), token: token, ready: true });
      }}>Connect<//>
    </div>`;
  }

  /* ---------------- main app ---------------- */
  function App() {
    var c = useState(makeConn); var conn = c[0], setConn = c[1];
    var m = useState(null); var meta = m[0], setMeta = m[1];
    var me = useState(null); var metaErr = me[0], setMetaErr = me[1];
    var s1 = useState(''); var street1 = s1[0], setStreet1 = s1[1];
    var pc = useState(''); var postcode = pc[0], setPostcode = pc[1];
    var ex = useState(''); var extraField = ex[0], setExtraField = ex[1];
    var st = useState('idle'); var status = st[0], setStatus = st[1];
    var pg = useState(null); var progress = pg[0], setProgress = pg[1];
    var gr = useState([]); var groups = gr[0], setGroups = gr[1];
    var lg = useState([]); var logLines = lg[0], setLogLines = lg[1];
    var cf = useState(false); var confirmOpen = cf[0], setConfirmOpen = cf[1];
    var apiRef = useRef(null);

    var log = useCallback(function (line) {
      setLogLines(function (l) { return l.concat(new Date().toISOString().substr(11, 8) + '  ' + line); });
    }, []);

    useEffect(function () {
      if (!conn.ready) return;
      var api = makeApi(conn); apiRef.current = api;
      (async function () {
        try {
          log('Connected: ' + conn.mode + ' @ ' + conn.baseUrl);
          var who = await api.get('WhoAmI'); log('WhoAmI OK — UserId ' + who.UserId);
          var md = await loadMetadata(api); setMeta(md);
          var guess = function (cands) {
            var needles = Array.prototype.slice.call(arguments, 1);
            var f = cands.find(function (f) {
              return needles.some(function (n) { return f.logical.toLowerCase().indexOf(n) >= 0 || (f.label || '').toLowerCase().indexOf(n) >= 0; });
            });
            return f ? f.logical : '';
          };
          setStreet1(guess(md.fields, 'street 1', 'address1', 'addressline1', 'line1'));
          setPostcode(guess(md.fields, 'postal', 'postcode', 'zip'));
          log('Metadata loaded: ' + md.oneToMany.length + ' N:1 + ' + md.manyToMany.length + ' N:N business relationships reference ' + FL_ENTITY + '.');
        } catch (e) { setMetaErr(e.message); log('ERROR: ' + e.message); }
      })();
    }, [conn]);

    var scan = useCallback(async function () {
      var api = apiRef.current;
      setStatus('scanning'); setGroups([]); setLogLines([]);
      try {
        var matchFields = [street1, postcode, extraField].filter(Boolean);
        log('Scanning all ' + FL_ENTITY + ' records… Match key: ' + matchFields.join(' + '));
        setProgress({ label: 'Loading functional locations', done: 0, total: 0 });
        var selArr = ['msdyn_functionallocationid', 'msdyn_name', 'createdon'].concat(matchFields)
          .filter(function (v, i, a) { return v && a.indexOf(v) === i; });
        var all = await api.getAll(FL_SET + '?$select=' + selArr.join(','),
          function (n) { setProgress({ label: 'Loading functional locations', done: n, total: 0 }); });
        log('Loaded ' + all.length + ' functional locations.');

        var map = new Map(), skipped = 0;
        all.forEach(function (fl) {
          var parts = matchFields.map(function (f) { return norm(fl[f]); });
          if (parts.some(function (p) { return p === ''; })) { skipped++; return; }
          var k = parts.join('|||');
          if (!map.has(k)) map.set(k, []);
          map.get(k).push(fl);
        });
        log(skipped + ' record(s) skipped (a match field was blank).');
        var dup = Array.from(map.entries()).filter(function (e) { return e[1].length > 1; });
        log(dup.length + ' duplicate group(s) found (' + dup.reduce(function (s, e) { return s + e[1].length; }, 0) + ' records).');

        var flat = [];
        dup.forEach(function (e) { e[1].forEach(function (fl) { flat.push(fl); }); });
        setProgress({ label: 'Counting references', done: 0, total: flat.length });
        var counts = new Map();
        await mapLimit(flat, 4, async function (fl) {
          counts.set(fl.msdyn_functionallocationid, await countRefs(api, meta, fl.msdyn_functionallocationid));
        }, function (d, t) { setProgress({ label: 'Counting references', done: d, total: t }); });

        var built = dup.map(function (e) {
          var members = e[1].map(function (fl) {
            var cnt = counts.get(fl.msdyn_functionallocationid);
            return { id: fl.msdyn_functionallocationid, name: fl.msdyn_name, createdon: fl.createdon,
                     street1: fl[street1], postcode: fl[postcode], total: cnt.total, byRel: cnt.byRel };
          });
          members.sort(function (a, b) { return (b.total - a.total) || (new Date(a.createdon) - new Date(b.createdon)); });
          var oversize = members.length > MAX_AUTO_INCLUDE;
          return { key: e[0], include: !oversize, oversize: oversize, survivorId: members[0].id,
                   street1: members[0].street1, postcode: members[0].postcode, members: members };
        }).sort(function (a, b) { return b.members.length - a.members.length; });

        var auto = built.filter(function (g) { return g.include; }).length;
        log(auto + ' group(s) auto-selected; ' + (built.length - auto) + ' oversized (>' + MAX_AUTO_INCLUDE + ') left UNSELECTED for review.');
        setGroups(built); setStatus('scanned'); setProgress(null);
      } catch (e) { log('SCAN FAILED: ' + e.message); setStatus('idle'); setProgress(null); }
    }, [meta, street1, postcode, extraField]);

    var process = useCallback(async function () {
      setConfirmOpen(false);
      var api = apiRef.current; setStatus('processing');
      var active = groups.filter(function (g) { return g.include; });
      var losers = [];
      active.forEach(function (g) { g.members.forEach(function (mm) { if (mm.id !== g.survivorId) losers.push({ g: g, m: mm }); }); });
      var moved = 0, deleted = 0;
      try {
        log('=== EXECUTION START — ' + active.length + ' group(s), ' + losers.length + ' loser(s) ===');
        setProgress({ label: 'Reallocating & deleting', done: 0, total: losers.length });
        for (var i = 0; i < losers.length; i++) {
          var g = losers[i].g, mm = losers[i].m;
          log('Loser ' + mm.name + ' (' + mm.id + ') → survivor ' + g.survivorId);
          for (var a = 0; a < meta.oneToMany.length; a++) moved += await reallocateN1(api, meta.oneToMany[a], mm.id, g.survivorId, log);
          for (var b = 0; b < meta.manyToMany.length; b++) moved += await reallocateNN(api, meta.manyToMany[b], meta, mm.id, g.survivorId, log);
          var remaining = (await countRefs(api, meta, mm.id)).total;
          if (remaining > 0) { log('   ⚠ ' + remaining + ' reference(s) remain — SKIPPING delete of ' + mm.id); }
          else { await api.del(FL_SET + '(' + mm.id + ')'); deleted++; log('   ✓ deleted ' + mm.id); }
          setProgress({ label: 'Reallocating & deleting', done: i + 1, total: losers.length });
        }
        log('=== DONE — ' + moved + ' reference(s) reallocated, ' + deleted + ' FL(s) deleted ===');
        setStatus('done'); setProgress(null);
      } catch (e) { log('EXECUTION HALTED: ' + e.message); setStatus('scanned'); setProgress(null); }
    }, [groups, meta]);

    function downloadLog() {
      var blob = new Blob([logLines.join('\n')], { type: 'text/plain' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fl-merge-audit-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
      a.click();
    }

    var totals = useMemo(function () {
      var active = groups.filter(function (g) { return g.include; });
      var losers = 0, refs = 0;
      active.forEach(function (g) { g.members.forEach(function (mm) { if (mm.id !== g.survivorId) { losers++; refs += mm.total; } }); });
      return { groups: active.length, losers: losers, refs: refs };
    }, [groups]);

    if (!conn.ready) return html`<${ConnectPanel} onConnect=${setConn} />`;

    var fieldOpts = meta ? meta.fields.map(function (f) { return { value: f.logical, label: f.logical + ' — ' + f.label }; }) : [];

    return html`<div className="wrap">
      <h1>Functional Location De-duplicator</h1>
      <div style=${{ margin: '6px 0 14px' }}>
        <${Badge}>Mode: ${conn.mode}<//>
        ${meta && html`<${Badge} c="brand">Ref relationships: ${meta.oneToMany.length + meta.manyToMany.length}<//>`}
      </div>

      ${metaErr && html`<${Bar} intent="error"><b>Could not load metadata</b>${metaErr}<//>`}

      ${meta && html`<div className="card">
        <h2>1 · Match key — group duplicates by these fields</h2>
        <div className="row">
          <${Field} label="Street 1 field"><${Select} value=${street1} onChange=${setStreet1} options=${fieldOpts} /><//>
          <${Field} label="Postcode field"><${Select} value=${postcode} onChange=${setPostcode} options=${fieldOpts} /><//>
          <${Field} label="+ Extra field (optional, tighter match)" hint="e.g. Name — high-confidence set">
            <${Select} value=${extraField} onChange=${setExtraField} options=${fieldOpts} placeholder="(none)" />
          <//>
          <${Btn} primary disabled=${!street1 || !postcode || status === 'scanning' || status === 'processing'} onClick=${scan}>
            ${status === 'scanning' ? 'Scanning…' : 'Scan for duplicates (read-only)'}
          <//>
        </div>
        <${Bar} intent="info">Records with a blank value in any match field are skipped. Groups larger than ${MAX_AUTO_INCLUDE} are left unselected (likely complexes sharing one postcode).<//>
      </div>`}

      ${progress && html`<div style=${{ margin: '12px 0' }}>
        <div>${progress.label}${progress.total ? ' — ' + progress.done + '/' + progress.total : ' — ' + progress.done}</div>
        <${Progress} value=${progress.total ? progress.done / progress.total : null} />
      </div>`}

      ${status !== 'idle' && status !== 'scanning' && groups.length === 0 &&
        html`<${Bar} intent="ok">No duplicate groups found for the selected match key. 🎉<//>`}

      ${groups.length > 0 && html`<div className="card">
        <h2>2 · Dry-run — review before anything changes</h2>
        <div className="desc">
          <${Badge} c="brand">Groups: ${totals.groups}<//>
          <${Badge} c="warn">To delete: ${totals.losers}<//>
          <${Badge} c="danger">Refs to reallocate: ${totals.refs}<//>
        </div>
        <div className="scroll"><table>
          <thead><tr><th>Use</th><th>Street 1 / Postcode</th><th>Records (survivor ★)</th><th className="num">Refs</th></tr></thead>
          <tbody>
            ${groups.map(function (g) { return html`<tr key=${g.key}>
              <td><input type="checkbox" checked=${g.include} onChange=${function (e) {
                var on = e.target.checked;
                setGroups(function (gs) { return gs.map(function (x) { return x.key === g.key ? Object.assign({}, x, { include: on }) : x; }); });
              }} /></td>
              <td><b>${g.street1 || '—'}</b><div className="mono">${g.postcode || '—'}</div>
                ${g.oversize && html`<span className="badge danger sm">⚠ ${g.members.length} records — review before merging</span>`}
              </td>
              <td>${g.members.map(function (mm) { return html`<div key=${mm.id} style=${{ padding: '2px 0' }}>
                <label style=${{ cursor: 'pointer' }}>
                  <input type="radio" name=${'sv-' + g.key} checked=${mm.id === g.survivorId} onChange=${function () {
                    setGroups(function (gs) { return gs.map(function (x) { return x.key === g.key ? Object.assign({}, x, { survivorId: mm.id }) : x; }); });
                  }} />
                  ${mm.id === g.survivorId ? ' ★ ' : '  '}<b>${mm.name || '(no name)'}</b>
                  <span className="mono muted"> ${mm.id.substr(0, 8)} · ${(mm.createdon || '').substr(0, 10)}</span>
                </label></div>`; })}</td>
              <td className="num">${g.members.map(function (mm) {
                var title = Object.keys(mm.byRel || {}).filter(function (k) { return mm.byRel[k] > 0; }).map(function (k) { return k + ': ' + mm.byRel[k]; }).join('\n');
                return html`<div key=${mm.id} title=${title} style=${{ padding: '2px 0' }}>${mm.id === g.survivorId ? html`<b>${mm.total}</b>` : mm.total}</div>`;
              })}</td>
            </tr>`; })}
          </tbody>
        </table></div>
      </div>`}

      ${groups.length > 0 && html`<div className="spaced">
        <${Btn} primary disabled=${status === 'processing' || totals.losers === 0} onClick=${function () { setConfirmOpen(true); }}>
          Reallocate & delete ${totals.losers} FL(s)
        <//>
        <${Btn} disabled=${status === 'processing'} onClick=${scan}>Re-scan<//>
        <${Btn} subtle onClick=${downloadLog}>Download audit log<//>
        ${status === 'done' && html`<${Badge} c="ok">Completed<//>`}
      </div>`}

      ${logLines.length > 0 && html`<div className="card">
        <h2>Activity log</h2>
        <div className="log mono">${logLines.join('\n')}</div>
      </div>`}

      ${confirmOpen && html`<div className="backdrop" onClick=${function (e) { if (e.target.className === 'backdrop') setConfirmOpen(false); }}>
        <div className="modal">
          <h3>Confirm reallocate & delete</h3>
          <div>This will reallocate <b>${totals.refs}</b> referencing record(s) onto survivors and then
            <b> permanently delete ${totals.losers} functional location(s)</b> across ${totals.groups} group(s).
            <br/><br/>Reference re-points are reversible from the audit log; <b>deletes are not</b>. Continue?</div>
          <div className="acts">
            <${Btn} onClick=${function () { setConfirmOpen(false); }}>Cancel<//>
            <${Btn} primary onClick=${process}>Yes — execute<//>
          </div>
        </div>
      </div>`}
    </div>`;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();
