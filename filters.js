// AppShuk filters: the pure logic behind the Filters panel (also loaded by the tests in node).
// State lives in the URL: ?sec=work&cat=work-business&price=free,one-time&max=20&age=g1-3&on=ios&lang=he&nusach=sefard&feat=offline,no-ads&sort=az&q=...
(function (root) {
  var GROUPS = ['sec', 'cat', 'price', 'age', 'on', 'lang', 'nusach', 'feat'];
  var AGE_ONLY = ['preschool', 'g1-3', 'g4-6', 'g7-8', 'hs', 'adults']; // an app marked 'all' shows under these
  var SORTS = ['new', 'popular', 'price', 'az'];
  var trim = function (s) { return String(s).trim(); };
  var has = function (list, v) { return (list || []).indexOf(v) >= 0; };
  function empty() { var s = { max: 0, sort: 'new', q: '' }; GROUPS.forEach(function (k) { s[k] = []; }); return s; }
  function parse(search) {
    var u = new URLSearchParams(search || ''), s = empty();
    GROUPS.forEach(function (k) { s[k] = (u.get(k) || '').split(',').map(trim).filter(Boolean); });
    s.price = s.price.map(function (v) { return v === 'paid' ? 'one-time' : v; }); // old links: ?price=paid
    s.max = [5, 20].indexOf(+u.get('max')) >= 0 ? +u.get('max') : 0;
    s.sort = SORTS.indexOf(u.get('sort')) >= 0 ? u.get('sort') : 'new';
    s.q = u.get('q') || '';
    return s;
  }
  // Writes the state into a query string, keeping any other keys (except demo) that were there
  function toQuery(s, search) {
    var u = new URLSearchParams(search || '');
    GROUPS.forEach(function (k) { if (s[k] && s[k].length) u.set(k, s[k].join(',')); else u.delete(k); });
    if (s.max) u.set('max', String(s.max)); else u.delete('max');
    if (s.sort && s.sort !== 'new') u.set('sort', s.sort); else u.delete('sort');
    if (s.q) u.set('q', s.q); else u.delete('q');
    u.delete('demo'); u.delete('filters');
    return u.toString().replace(/%2C/g, ',');
  }
  function priceType(a) { return a.lic ? 'license' : a.pr === 'subscription' ? 'subscription' : a.pr === 'one-time' ? 'one-time' : 'free'; }
  function inPlace(a, s, ctx) {
    if (!s.sec.length && !s.cat.length) return true;
    if (s.cat.some(function (c) { return has(a.c, c); })) return true;
    var doorsOf = a.c.map(function (c) { return ctx.subDoor[c]; });
    // a ticked section counts as a whole unless some of its categories are ticked (then only those)
    return s.sec.some(function (d) { return has(doorsOf, d) && !s.cat.some(function (c) { return ctx.subDoor[c] === d; }); });
  }
  function test(a, k, s, ctx) {
    var v = s[k];
    switch (k) {
      case 'place': return inPlace(a, s, ctx);
      case 'price': return !v.length || has(v, priceType(a));
      case 'max': return !s.max || (a.p || 0) < s.max;
      case 'age': return !v.length || v.some(function (x) { return has(a.ages, x) || (has(a.ages, 'all') && has(AGE_ONLY, x)); });
      case 'on': return !v.length || v.some(function (x) { return has(a.pf, x); });
      case 'lang': return !v.length || v.some(function (x) { return has(a.ln, x); });
      case 'nusach': return !v.length || v.some(function (x) { return has(a.ns, x) || (x !== 'any' && has(a.ns, 'any')); });
      case 'feat': return v.every(function (x) { return has(a.ft, x); }); // features: every ticked one must be there
    }
    return true;
  }
  var TESTS = ['place', 'price', 'max', 'age', 'on', 'lang', 'nusach', 'feat'];
  function match(a, s, ctx, skip) { for (var i = 0; i < TESTS.length; i++) if (TESTS[i] !== skip && !test(a, TESTS[i], s, ctx)) return false; return true; }
  function apply(list, s, ctx) { return list.filter(function (a) { return match(a, s, ctx); }); }
  // How many apps each option would show, given every other filter (so a 0 can be greyed out)
  function facets(list, s, ctx) {
    var out = { sec: {}, cat: {}, price: {}, max: {}, age: {}, on: {}, lang: {}, nusach: {}, feat: {} };
    var bump = function (g, v) { out[g][v] = (out[g][v] || 0) + 1; };
    list.forEach(function (a) {
      if (match(a, s, ctx, 'place')) {
        var ds = {}; a.c.forEach(function (c) { bump('cat', c); ds[ctx.subDoor[c]] = 1; });
        Object.keys(ds).forEach(function (d) { bump('sec', d); });
      }
      if (match(a, s, ctx, 'price')) bump('price', priceType(a));
      if (match(a, s, ctx, 'max')) { bump('max', 0); if ((a.p || 0) < 5) bump('max', 5); if ((a.p || 0) < 20) bump('max', 20); }
      if (match(a, s, ctx, 'age')) {
        var ag = {}; (a.ages || []).forEach(function (x) { ag[x] = 1; if (x === 'all') AGE_ONLY.forEach(function (y) { ag[y] = 1; }); });
        Object.keys(ag).forEach(function (x) { bump('age', x); });
      }
      if (match(a, s, ctx, 'on')) (a.pf || []).forEach(function (x) { bump('on', x); });
      if (match(a, s, ctx, 'lang')) (a.ln || []).forEach(function (x) { bump('lang', x); });
      if (match(a, s, ctx, 'nusach')) {
        var ns = {}; (a.ns || []).forEach(function (x) { ns[x] = 1; if (x === 'any') ['ashkenaz', 'sefard', 'edot', 'chabad'].forEach(function (y) { ns[y] = 1; }); });
        Object.keys(ns).forEach(function (x) { bump('nusach', x); });
      }
      if (match(a, s, ctx)) (a.ft || []).forEach(function (x) { bump('feat', x); }); // features narrow further, so count within the current result
    });
    return out;
  }
  function activeCount(s) { var n = s.max ? 1 : 0; GROUPS.forEach(function (k) { n += s[k].length; }); return n; }
  function byNew(x, y) { return (y.dt || '').localeCompare(x.dt || '') || x.t.localeCompare(y.t); }
  function sort(list, how) {
    var l = list.slice();
    if (how === 'price') l.sort(function (x, y) { return (x.p || 0) - (y.p || 0) || x.t.localeCompare(y.t); });
    else if (how === 'az') l.sort(function (x, y) { return x.t.localeCompare(y.t); });
    else if (how === 'popular') l.sort(function (x, y) { return (y.pop || 0) - (x.pop || 0) || byNew(x, y); }); // no popularity data yet: same as newest
    else l.sort(byNew);
    return l;
  }
  var api = { GROUPS: GROUPS, empty: empty, parse: parse, toQuery: toQuery, priceType: priceType, match: match, apply: apply, facets: facets, activeCount: activeCount, sort: sort, byNew: byNew };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AppShukFilters = api;
})(this);
