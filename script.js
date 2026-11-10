// Submit form: builds an email with the author's details and opens their email app.
(function () {
  var form = document.getElementById('submit-form');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    if (!form.checkValidity()) return;
    e.preventDefault();
    var fd = new FormData(form);
    var lines = [];
    var seen = {};
    fd.forEach(function (v, k) { if (!String(v).trim()) return; if (seen[k] != null) { lines[seen[k]] += ', ' + v; return; } seen[k] = lines.length; lines.push(k + ': ' + v); });
    var subject = 'App submission: ' + (fd.get('App name') || '');
    var cc = form.getAttribute('data-cc'); // Bin's own inbox gets a copy of every submission
    var href = 'mailto:' + form.getAttribute('data-to') + '?' + (cc ? 'cc=' + encodeURIComponent(cc) + '&' : '') + 'subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(lines.join('\n') + '\n\n(Sent from the AppShuk submission form)');
    window.location.href = href;
  });
})();

// Submit form: a "Submit it" link from an empty category arrives as ?c=<category> and preselects it.
(function () {
  var sel = document.getElementById('f-cat');
  if (!sel || !window.URLSearchParams) return;
  var c = new URLSearchParams(location.search).get('c');
  if (!c) return;
  for (var i = 0; i < sel.options.length; i++) if (sel.options[i].getAttribute('data-c') === c) { sel.selectedIndex = i; break; }
})();

// ---- Search, filters, sort, list/grid view, "Show more", demo mode ----
(function () {
  var body = document.body, ROOT = body.getAttribute('data-root') || '';
  var qs = new URLSearchParams(location.search);
  // Demo mode: ?demo=1 mixes in 30 pretend apps (remembered for this visit); ?demo=0 turns it off
  try {
    if (qs.get('demo') === '1') sessionStorage.setItem('appshuk-demo', '1');
    if (qs.get('demo') === '0') sessionStorage.removeItem('appshuk-demo');
  } catch (e) {}
  var DEMO = false; try { DEMO = sessionStorage.getItem('appshuk-demo') === '1'; } catch (e) {}
  if (DEMO) { var dn = document.querySelector('.demo-note'); if (dn) dn.hidden = false; }

  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var fold = function (s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f\u0591-\u05c7]/g, '').toLowerCase().replace(/['’"`״׳]/g, '').replace(/o/g, 'a'); };
  var money = function (p) { return p > 0 ? '$' + Number(p).toFixed(2).replace(/\.00$/, '') : 'Free'; };
  var IDX = null, loading = null;
  function load() {
    if (IDX) return Promise.resolve(IDX);
    var get = function (f) { return fetch(ROOT + f).then(function (r) { return r.json(); }); };
    // The pretend apps sit in their own file, fetched only in demo mode
    if (!loading) loading = Promise.all([get('search-index.json'), DEMO ? get('demo-index.json').catch(function () { return { apps: [] }; }) : null]).then(function (x) {
      return window.AppShukIndexHook ? window.AppShukIndexHook(x) : x;   // backend build only: listings from the database
    }).then(function (x) {
      var j = x[0]; if (x[1]) j.apps = j.apps.concat(x[1].apps);
      j.subBy = {}; j.doorBy = {};
      j.doors.forEach(function (d) { j.doorBy[d.s] = d; });
      j.subs.forEach(function (s) { j.subBy[s.s] = s; });
      j.all = j.apps.filter(function (a) { return DEMO || !a.demo; });
      IDX = j; return j;
    });
    return loading;
  }
  function href(a) { if (a.dyn) return ROOT + 'app/?s=' + encodeURIComponent(a.s); return a.demo ? (a.pg ? ROOT + 'demo/' + a.s + '/' : ROOT + 'demo/?a=' + encodeURIComponent(a.s)) : ROOT + 'apps/' + a.s + '/'; }
  function thumb(a) {
    if (a.img) return '<img src="' + (/^https?:/.test(a.img) ? '' : ROOT) + esc(a.img) + '" alt="" width="56" height="56" loading="lazy">';
    return '<span class="ico-letters" aria-hidden="true">' + esc(a.t.split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('')) + '</span>';
  }
  function row(a) {
    var d = IDX.doorBy[IDX.subBy[a.c[0]].d];
    return '<li class="row" style="--c:' + d.c + ';--t:' + d.t + '"><a href="' + href(a) + '"><span class="ico">' + thumb(a) + '</span><span class="row-main"><span class="row-title">' + esc(a.t) +
      '</span><span class="row-by">' + (a.sm ? '<b class="tag">Sample</b> ' : '') + 'by ' + esc(a.a) + '</span><span class="row-short">' + esc(a.d) +
      '</span></span><span class="row-chips"><b class="chip chip-price' + (a.pr === 'free' ? ' free' : a.pr === 'subscription' ? ' sub' : '') + '">' + esc(a.pl) + '</b><span class="chip chip-age">' + esc(a.g) + '</span></span></a></li>';
  }
  // Search: every word must match somewhere; title matches rank first
  function search(q, list) {
    var words = fold(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return list.map(function (a) {
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (a.h.indexOf(w) < 0) return null;
        if (a.ht.indexOf(w) === 0) score += 6; else if (a.ht.indexOf(' ' + w) >= 0) score += 4; else if (a.ht.indexOf(w) >= 0) score += 3;
        else if (a.tags.some(function (t) { return fold(t).indexOf(w) === 0; })) score += 2; else score += 1;
      }
      return { a: a, score: score };
    }).filter(Boolean).sort(function (x, y) { return y.score - x.score || x.a.t.localeCompare(y.a.t); }).map(function (x) { return x.a; });
  }
  function sectionHits(q) {
    var w = fold(q).trim(); if (w.length < 2) return [];
    var out = [];
    IDX.doors.forEach(function (d) { if (d.h.indexOf(w) >= 0) out.push({ n: d.n, u: ROOT + 'category/' + d.s + '/', k: 'Section' }); });
    IDX.subs.forEach(function (s) { if (s.h.indexOf(w) >= 0) out.push({ n: s.n + (s.he ? ' · ' + s.he : ''), u: ROOT + 'category/' + s.d + '/' + s.s + '/', k: 'Category' }); });
    IDX.tags.forEach(function (t) { if (fold(t.n).indexOf(w) === 0) out.push({ n: t.n, u: ROOT + 'tag/' + t.s + '/', k: 'Tag' }); });
    return out.slice(0, 4);
  }

  // ---- Instant suggestions under every search box ----
  document.querySelectorAll('.js-search').forEach(function (input) {
    var box = document.getElementById(input.getAttribute('aria-controls'));
    var form = input.form, onSearchPage = !!document.querySelector('.browse[data-scope="search"]') && form.classList.contains('big');
    var hide = function () { box.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    input.addEventListener('focus', load);
    input.addEventListener('input', function () {
      if (onSearchPage) return; // the results list itself updates on the search page
      var q = input.value.trim();
      if (!q) return hide();
      load().then(function () {
        var hits = search(q, IDX.all), secs = sectionHits(q), html = '';
        hits.slice(0, 5).forEach(function (a) {
          html += '<a role="option" class="sg-app" href="' + href(a) + '"><span class="ico">' + thumb(a) + '</span><span><b>' + esc(a.t) + '</b><small>' + esc(a.a) + ' · ' + esc(a.pl) + '</small></span></a>';
        });
        secs.forEach(function (s) { html += '<a role="option" class="sg-sec" href="' + s.u + '"><small>' + s.k + '</small> ' + esc(s.n) + '</a>'; });
        html += hits.length ? '<a role="option" class="sg-all" href="' + ROOT + 'search/?q=' + encodeURIComponent(q) + '">See all ' + hits.length + ' result' + (hits.length > 1 ? 's' : '') + '</a>'
          : (secs.length ? '' : '<p class="sg-none">No apps match “' + esc(q) + '” yet.</p>');
        box.innerHTML = html; box.hidden = false; input.setAttribute('aria-expanded', 'true');
      });
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    document.addEventListener('click', function (e) { if (!form.contains(e.target)) hide(); });
  });

  // ---- Browsable lists ----
  var VIEW_KEY = 'appshuk-view';
  function getView() { try { var v = localStorage.getItem(VIEW_KEY); if (v) return v; } catch (e) {} return window.matchMedia('(min-width: 760px)').matches ? 'grid' : 'list'; }
  var F = window.AppShukFilters;
  var CTX = null;
  document.querySelectorAll('.browse').forEach(function (el) {
    var scope = el.getAttribute('data-scope');
    var ul = el.querySelector('.rows');
    if (el.classList.contains('plain')) { if (DEMO && scope === 'featured') load().then(function (j) { ul.innerHTML = j.all.filter(function (a) { return a.f || a.demo; }).sort(byNew).slice(0, 8).map(row).join(''); var e = el.parentNode.querySelector('.empty'); if (e && ul.children.length) e.hidden = true; }); return; }
    var st = F.parse(location.search);
    var shown = 20, view = getView();
    var nEl = el.querySelector('[data-n]'), more = el.querySelector('.more-wrap'), none = el.querySelector('.none-msg');
    var panel = el.querySelector('.fpanel'), fbtn = el.querySelector('.fbtn'), badge = el.querySelector('.fbadge');
    var chipsBox = el.querySelector('.achips'), chipsList = el.querySelector('.achips-list');
    var qInput = scope === 'search' ? document.querySelector('.search.big .js-search') : null;
    if (qInput) qInput.value = st.q;
    var sortSel = el.querySelector('select[data-f="sort"]');
    sortSel.value = st.sort; fitSel(sortSel); sortSel.classList.toggle('on', st.sort !== 'new');
    sortSel.addEventListener('change', function () { st.sort = sortSel.value; fitSel(sortSel); sortSel.classList.toggle('on', st.sort !== 'new'); shown = 20; render(true); });
    // Panel inputs <-> state
    var inputs = panel.querySelectorAll('input');
    function toInputs() {
      inputs.forEach(function (i) {
        if (i.name === 'max') i.checked = (+i.value === st.max);
        else i.checked = (st[i.name] || []).indexOf(i.value) >= 0;
      });
      panel.querySelectorAll('.fo-subs').forEach(function (box) {
        var d = box.getAttribute('data-door');
        box.hidden = !(st.sec.indexOf(d) >= 0 || [].some.call(box.querySelectorAll('input'), function (i) { return i.checked; }));
      });
    }
    function fromInputs() {
      F.GROUPS.forEach(function (k) { st[k] = []; });
      st.max = 0;
      inputs.forEach(function (i) { if (!i.checked) return; if (i.name === 'max') st.max = +i.value; else st[i.name].push(i.value); });
      // a category whose section was unticked goes with it
      if (panel.querySelector('.fo-subs')) st.cat = st.cat.filter(function (c) { return st.sec.indexOf(CTX.subDoor[c]) >= 0; });
    }
    inputs.forEach(function (i) { i.addEventListener('change', function () { fromInputs(); toInputs(); shown = 20; render(true); }); });
    function clearAll() { var keepQ = st.q, keepSort = st.sort; st = F.empty(); st.q = keepQ; st.sort = keepSort; toInputs(); shown = 20; render(true); }
    el.querySelectorAll('.fp-clear').forEach(function (b) { b.addEventListener('click', clearAll); });
    // Phone: the panel is a full-height sheet
    var wide = window.matchMedia('(min-width: 960px)');
    function openSheet() { panel.classList.add('is-open'); document.documentElement.classList.add('sheet-open'); fbtn.setAttribute('aria-expanded', 'true'); panel.focus(); }
    function closeSheet() { if (!panel.classList.contains('is-open')) return; panel.classList.remove('is-open'); document.documentElement.classList.remove('sheet-open'); fbtn.setAttribute('aria-expanded', 'false'); fbtn.focus(); }
    fbtn.addEventListener('click', function () { if (wide.matches) { panel.focus(); panel.scrollIntoView({ block: 'nearest' }); } else openSheet(); });
    panel.querySelector('.fp-x').addEventListener('click', closeSheet);
    panel.querySelector('.fp-done').addEventListener('click', function () { closeSheet(); el.scrollIntoView({ block: 'start' }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    wide.addEventListener && wide.addEventListener('change', function () { if (wide.matches) closeSheet(); });
    // Chips for active filters, built from the panel's own labels
    function labelOf(name, value) { var i = panel.querySelector('input[name="' + name + '"][value="' + value + '"]'); return i ? i.parentNode.querySelector('.fo-l').textContent : value; }
    function chips() {
      var html = '';
      F.GROUPS.forEach(function (k) { st[k].forEach(function (v) { html += '<li><button type="button" data-k="' + k + '" data-v="' + esc(v) + '" aria-label="Remove filter: ' + esc(labelOf(k, v)) + '">' + esc(labelOf(k, v)) + '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8"/></svg></button></li>'; }); });
      if (st.max) html += '<li><button type="button" data-k="max" data-v="' + st.max + '" aria-label="Remove filter: Under $' + st.max + '">Under $' + st.max + '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8"/></svg></button></li>';
      chipsList.innerHTML = html; chipsBox.hidden = !html;
      chipsList.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-k'), v = b.getAttribute('data-v');
          if (k === 'max') st.max = 0; else st[k] = st[k].filter(function (x) { return x !== v; });
          if (k === 'sec') st.cat = st.cat.filter(function (c) { return CTX.subDoor[c] !== v; });
          toInputs(); shown = 20; render(true);
        });
      });
    }
    function setView(v) {
      view = v; el.classList.toggle('as-grid', v === 'grid');
      el.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === v)); });
    }
    setView(view);
    el.querySelectorAll('[data-view]').forEach(function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-view')); try { localStorage.setItem(VIEW_KEY, view); } catch (e) {} }); });
    el.querySelector('.more-btn').addEventListener('click', function () { shown += 20; render(false); });
    function inScope(a) {
      var p = scope.split(':'), k = p[0], v = p[1];
      if (k === 'door') return a.c.some(function (c) { return IDX.subBy[c].d === v; });
      if (k === 'sub') return a.c.indexOf(v) >= 0;
      if (k === 'tag') return a.tags.some(function (t) { return slug(t) === v; });
      return true;
    }
    var noneDefault = none.innerHTML;
    function render(syncUrl) {
      none.innerHTML = noneDefault;
      var q = qInput ? qInput.value.trim() : '';
      st.q = scope === 'search' ? q : '';
      var nf = F.activeCount(st);
      var waiting = scope === 'search' && !q && !nf;
      var base = scope === 'search' ? (q ? search(q, IDX.all) : (nf ? IDX.all : [])) : IDX.all.filter(inScope);
      var list = F.apply(base, st, CTX);
      if (!(scope === 'search' && q && st.sort === 'new')) list = F.sort(list, st.sort); // a search keeps best-match order unless a sort is picked
      ul.innerHTML = list.slice(0, shown).map(row).join('');
      var nTxt = list.length + ' app' + (list.length === 1 ? '' : 's');
      nEl.textContent = waiting ? 'Type to search, or open Filters' : (nf ? 'Showing ' : '') + nTxt + (q ? ' for “' + q + '”' : '');
      panel.querySelector('[data-fp-n]').textContent = waiting ? '0 apps' : nTxt;
      panel.querySelector('[data-fp-n2]').textContent = waiting ? 'results' : nTxt;
      badge.hidden = !nf; badge.textContent = nf;
      fbtn.classList.toggle('on', !!nf);
      fbtn.setAttribute('aria-label', 'Filters' + (nf ? ', ' + nf + ' on' : ''));
      more.hidden = list.length <= shown;
      // No apps in this place at all (before the first are listed): keep the friendly note, hide the filter bar and count
      var bare = !(scope === 'search' ? IDX.all : IDX.all.filter(inScope)).length;
      el.classList.toggle('is-empty', bare);
      none.hidden = bare ? false : !!list.length || waiting;
      if (!list.length && nf && !waiting && !bare) {
        none.innerHTML = '<div class="empty"><p><strong>No apps match these filters.</strong></p><p>Try removing one, or <button type="button" class="linkbtn">clear all filters</button>.</p></div>';
        none.querySelector('.linkbtn').onclick = clearAll;
      }
      // counts next to each option; options that would show nothing are greyed
      var fc = F.facets(base, st, CTX);
      panel.querySelectorAll('[data-fn]').forEach(function (i) {
        var p = i.getAttribute('data-fn').split(':'), n = (fc[p[0]] || {})[p[1]] || 0;
        i.textContent = n; i.parentNode.classList.toggle('zero', !n);
      });
      panel.querySelectorAll('.fg').forEach(function (g) {
        var k = g.getAttribute('data-f'), c = k === 'price' ? st.price.length + (st.max ? 1 : 0) : k === 'sec' ? st.sec.length + st.cat.length : (st[k] || []).length;
        var b = g.querySelector('.fg-n'); b.hidden = !c; b.textContent = c;
        if (c) g.open = true;
      });
      chips();
      if (syncUrl && history.replaceState) {
        var s = F.toQuery(st, location.search);
        history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
      }
      if (scope === 'search') {
        var ss = document.querySelector('.sugg-sections'), secs = q ? sectionHits(q) : [];
        ss.hidden = !secs.length;
        ss.innerHTML = secs.length ? '<ul class="chips">' + secs.map(function (s) { return '<li><a href="' + s.u + '"><small>' + s.k + '</small> ' + esc(s.n) + '</a></li>'; }).join('') + '</ul>' : '';
      }
    }
    load().then(function (j) {
      if (!CTX) { CTX = { subDoor: {} }; j.subs.forEach(function (s) { CTX.subDoor[s.s] = s.d; }); }
      toInputs(); render(false);
      if ((qs.get('filters') === '1' || location.hash === '#filters') && !wide.matches) openSheet();
    });
    if (qInput) {
      qInput.addEventListener('input', function () { shown = 20; if (IDX) render(true); });
      qInput.form.addEventListener('submit', function (e) { e.preventDefault(); qInput.blur(); if (IDX) render(true); });
    }
  });
  // Each filter is as wide as the choice it shows, so the bar stays on one line
  var meas;
  function fitSel(s) {
    if (!meas) { meas = document.createElement('span'); meas.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0'; document.body.appendChild(meas); }
    var cs = getComputedStyle(s); meas.style.font = cs.font; meas.style.letterSpacing = cs.letterSpacing;
    meas.textContent = s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : '';
    s.style.width = Math.ceil(meas.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 4) + 'px';
  }
  function byNew(x, y) { return (y.dt || '').localeCompare(x.dt || '') || x.t.localeCompare(y.t); }
  function slug(t) { return String(t).trim().toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9\u0590-\u05ff]+/g, '-').replace(/^-|-$/g, ''); }

  // Live counts on chips (they change in demo mode)
  var counts = document.querySelectorAll('[data-count]');
  if (counts.length && DEMO) load().then(function (j) {
    counts.forEach(function (c) {
      var p = c.getAttribute('data-count').split(':');
      c.textContent = j.all.filter(function (a) { return p[0] === 'door' ? a.c.some(function (x) { return j.subBy[x].d === p[1]; }) : a.c.indexOf(p[1]) >= 0; }).length;
    });
  });
  // Demo stand-in page shows the pretend app's name
  var dt = document.getElementById('demo-title');
  if (dt && qs.get('a')) load().then(function (j) { var a = j.apps.filter(function (x) { return x.s === qs.get('a'); })[0]; if (a) dt.textContent = a.t; });
})();

// Submit form: tags limited to 5
(function () {
  var t = document.getElementById('f-tags');
  if (!t) return;
  t.addEventListener('input', function () {
    var n = t.value.split(',').filter(function (x) { return x.trim(); }).length;
    t.setCustomValidity(n > 5 ? 'Up to 5 tags, please.' : '');
  });
})();

// "Request a quote" (school / organization licenses): opens a short form; sending builds an email to the maker with AppShuk copied.
(function () {
  var btns = document.querySelectorAll('.quote-open');
  btns.forEach(function (btn) {
    var form = document.getElementById(btn.getAttribute('aria-controls'));
    if (!form) return;
    btn.addEventListener('click', function () {
      var open = form.hidden;
      form.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { var f = form.querySelector('input'); if (f) { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(function () { f.focus({ preventScroll: true }); }, 350); } }
    });
    form.addEventListener('submit', function (e) {
      if (!form.checkValidity()) return;
      e.preventDefault();
      var fd = new FormData(form), lines = [];
      fd.forEach(function (v, k) { if (String(v).trim()) lines.push(k + ': ' + String(v).trim()); });
      var app = form.getAttribute('data-app');
      var body = 'Hello,\n\nI found ' + app + ' on AppShuk and would like a quote.\n\n' + lines.join('\n') +
        '\n\nThank you.\n\n(Sent from AppShuk, theappshuk.com. AppShuk is copied on this request.)';
      var href = 'mailto:' + form.getAttribute('data-to') +
        '?cc=' + encodeURIComponent(form.getAttribute('data-cc')) +
        '&subject=' + encodeURIComponent('AppShuk quote request: ' + app) +
        '&body=' + encodeURIComponent(body);
      form.setAttribute('data-sent', href);
      window.location.href = href;
    });
  });
})();

// Submit form: Pricing choice shows the right price field; one-time price is required (min from fee.js) with a live "You receive about" calculator.
// AppShuk keeps its fee and Stripe's card fee comes off each sale; the maker's share is computed by site/fee.js (rounded down to the cent).
// The "You receive" number shows only for a valid price (at or above the minimum).
(function () {
  var box = document.getElementById('pricing');
  if (!box) return;
  var FEE = window.AppShukFee, price = document.getElementById('f-price');
  var calc = box.querySelector('.calc'), out = box.querySelector('[data-calc]'), field = box.querySelector('[data-calc-field]');
  function cur() { var c = box.querySelector('input[name="Pricing"]:checked'); return c ? c.getAttribute('data-p') : 'free'; }
  function update() {
    var p = cur();
    box.querySelectorAll('[data-show]').forEach(function (d) { d.hidden = d.getAttribute('data-show') !== p; });
    price.required = p === 'one-time';
    var v = parseFloat(price.value);
    var low = p === 'one-time' && price.value !== '' && FEE && !FEE.validPrice(v);
    price.setCustomValidity(low ? 'The lowest price is $' + FEE.MIN_PRICE.toFixed(2) + '.' : '');
    if (p === 'one-time' && v > 0 && FEE && FEE.validPrice(v)) {
      var get = FEE.receive(v); // rounded down to the cent, so we never overstate
      out.textContent = '$' + get.toFixed(2); calc.hidden = false; field.value = '$' + get.toFixed(2);
    } else { calc.hidden = true; field.value = ''; }
  }
  box.addEventListener('change', update);
  price.addEventListener('input', update);
  update();
})();
