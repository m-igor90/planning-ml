/* Moteur de planning du service (postes de 12 h, plusieurs unités).
   Utilisable dans le navigateur (window.Planner) et sous Node (module.exports).

   Codes d'une case : J (jour 7h-19h), N (nuit 19h-7h), B (journée de 7 h en semaine),
   suffixe « @UNITE » pour un renfort dans une autre unité (ex. J@KAN).
   Absences et repos : CA (congé annuel), FC (formation), RsA (repos souhaité), Rtp (repos temps partiel),
   RPV (repos de veille), RH, RC, JF. Préfixe « ! » : case fixée (gardée par le générateur). */
(function (root) {
  'use strict';

  var POSTES = ['J', 'N'];
  var WORK = { J: 1, N: 1, B: 1, FC: 1 };
  var GROUPS = { IDE: 'inf', PDE: 'inf', AP: 'ap', CADRE: 'cadre' };
  var GEN = ['', 'J', 'N', 'B', 'RPV', 'RH', 'RC']; // codes que le générateur peut remplacer
  /* Trame fixe : la ligne n'est jamais modifiée, sauf si la trame n'a pas été saisie pour le mois (plan.trameAuto[id]) :
     la ligne est alors générée comme les autres, et l'interface demande de la vérifier. */
  function trameActive(s, plan) { return !!s.trameFixe && !(plan && plan.trameAuto && plan.trameAuto[s.id]); }
  var DEFAULT_RULES = {
    hJour: 12, hNuit: 12 + 50 / 60, hB: 7, max7j: 48, maxSuite12: 3, maxSuite: 5, maxNuitsSuite: 2,
    reposApresNuit: 2, rattrapageMax: 24, iterations: 60000, restarts: 2
  };

  function rulesOf(r) { var o = {}, k; for (k in DEFAULT_RULES) o[k] = DEFAULT_RULES[k]; for (k in (r || {})) if (r[k] !== undefined && r[k] !== null && r[k] !== '') o[k] = r[k]; return o; }
  function parseCell(v) {
    if (!v) return { c: '', u: null, l: false };
    var s = String(v), l = s.charAt(0) === '!'; if (l) s = s.slice(1);
    var k = s.indexOf('@');
    return { c: k >= 0 ? s.slice(0, k) : s, u: k >= 0 ? s.slice(k + 1) : null, l: l };
  }
  function isWork(c) { return !!WORK[c]; }
  function groupOf(s) { return GROUPS[s.qualif] || 'inf'; }

  /* ---------- calendrier ---------- */
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mo - 1, da);
  }
  /* Jours fériés en France (fonction publique hospitalière) ; modifiables mois par mois. */
  function holidaysDefault(y, m) {
    var e = easter(y), list = [];
    var add = function (dt) { if (dt.getMonth() + 1 === m && list.indexOf(dt.getDate()) < 0) list.push(dt.getDate()); };
    [[1, 1], [5, 1], [5, 8], [7, 14], [8, 15], [11, 1], [11, 11], [12, 25]].forEach(function (x) { add(new Date(y, x[0] - 1, x[1])); });
    [1, 39, 50].forEach(function (n) { var d = new Date(e); d.setDate(d.getDate() + n); add(d); });
    return list.sort(function (a, b) { return a - b; });
  }
  var EPOCH = Date.UTC(2024, 0, 1); // un lundi
  function absDay(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000); }
  function monthInfo(y, m, holidays) {
    var D = new Date(y, m, 0).getDate(), hol = holidays || [], days = [], wd = 0;
    for (var d = 1; d <= D; d++) {
      var dow = new Date(y, m - 1, d).getDay(), h = hol.indexOf(d) >= 0;
      days.push({ d: d, dow: dow, we: dow === 0 || dow === 6, hol: h, abs: absDay(y, m, d) });
      if (dow !== 0 && dow !== 6 && !h) wd++;
    }
    return { y: y, m: m, D: D, days: days, workingDays: wd };
  }

  /* Temps théorique du mois : 7 h par jour ouvré au prorata du taux (32h30/35 pour un agent de nuit). */
  function theoretical(s, info, plan) {
    var o = plan && plan.theo && plan.theo[s.id];
    if (o !== undefined && o !== null && o !== '') return +o;
    return Math.round(info.workingDays * 7 * (+s.taux || 0) / 100 * (s.agentNuit ? 32.5 / 35 : 1) * 100) / 100;
  }
  function hoursOf(code, s, R) {
    if (code === 'J') return R.hJour;
    if (code === 'N') return R.hNuit;
    if (code === 'B' || code === 'CA') return R.hB * (+s.taux || 100) / 100;
    if (code === 'FC') return 7;
    return 0;
  }

  /* ---------- état ---------- */
  function prevTail(s, prev) {
    if (!prev || !prev.cells) return { known: false, codes: [], days: [] };
    var pi = monthInfo(prev.year, prev.month, prev.holidays), src = prev.cells[s.id] || {}, codes = [], days = [];
    for (var d = Math.max(1, pi.D - 13); d <= pi.D; d++) { codes.push(parseCell(src[d]).c); days.push(pi.days[d - 1]); }
    return { known: true, codes: codes, days: days };
  }
  function buildState(opts) {
    var R = rulesOf(opts.rules), info = monthInfo(opts.year, opts.month, opts.holidays), plan = opts.plan || {};
    var cells = opts.cells || plan.cells || {}, carry = opts.carry || {};
    var units = opts.units || [];
    var people = (opts.staff || []).filter(function (s) { return groupOf(s) !== 'cadre'; }).map(function (s) {
      var src = cells[s.id] || {}, row = [], unit = [], lock = [];
      for (var d = 1; d <= info.D; d++) { var pc = parseCell(src[d]); row.push(pc.c); unit.push(pc.u); lock.push(trameActive(s, plan) || pc.l || GEN.indexOf(pc.c) < 0); }
      var theo = theoretical(s, info, plan), cum = +carry[s.id] || 0, aim = +s.soldeVise || 0;
      var catchUp = Math.max(-R.rattrapageMax, Math.min(R.rattrapageMax, cum - aim));
      var pre = prevTail(s, opts.prev);
      return { s: s, g: groupOf(s), home: s.unite, poly: s.polyvalence || [], row: row, unit: unit, lock: lock, theo: theo,
        target: s.vacataire ? 0 : Math.max(0, theo - catchUp), pre: pre, all: pre.days.concat(info.days),
        rest: +s.reposApresNuit > 0 ? +s.reposApresNuit : R.reposApresNuit, wH: s.prioriteHeures ? 6 : 2 };
    });
    return { R: R, info: info, units: units, people: people };
  }

  /* ---------- règles d'une personne ----------
     Renvoie la pénalité de la ligne ; si out est un tableau, y ajoute les alertes. */
  var HARD = 100000;
  function checkRow(st, a, row, unit, out) {
    var R = st.R, info = st.info, s = a.s, D = info.D, pen = 0;
    var full = a.pre.codes.concat(row), off = a.pre.codes.length, days = a.all, F = full.length;
    var dayNo = function (i) { return i - off + 1; };
    var issue = function (lvl, i, txt, p) { pen += p; if (out) out.push({ lvl: lvl, d: Math.max(1, dayNo(i)), sid: s.id, txt: txt }); };
    var work = function (i) { return i >= 0 && i < F && isWork(full[i]); };
    var restDay = function (i) { return i >= 0 && i < F && !isWork(full[i]) && !(i > 0 && full[i - 1] === 'N'); }; // repos hors repos de veille
    var i, j, k;
    // Nuits : repos de veille puis repos ; pas plus de maxNuitsSuite nuits d'affilée
    var nRun = 0;
    for (i = 0; i < F; i++) {
      if (full[i] === 'N') {
        nRun++;
        if (nRun > R.maxNuitsSuite && i >= off) issue('err', i, 'Plus de ' + R.maxNuitsSuite + ' nuits d’affilée', HARD);
        if (full[i + 1] !== 'N') for (k = 1; k <= a.rest; k++) { j = i + k; if (j < F && j >= off && work(j)) { issue('err', j, k === 1 ? 'Travail le lendemain d’une nuit (repos de veille obligatoire)' : 'Moins de ' + a.rest + ' jours de repos après les nuits', HARD); break; } }
      } else nRun = 0;
    }
    // Jours de travail d'affilée
    var run = 0, run12 = 0;
    for (i = 0; i < F; i++) {
      if (work(i)) { run++; if (full[i] === 'J' || full[i] === 'N') run12++; else run12 = 0; } else { run = 0; run12 = 0; }
      if (i >= off && run > R.maxSuite) issue('err', i, 'Plus de ' + R.maxSuite + ' jours de travail d’affilée', HARD);
      if (i >= off && run12 > R.maxSuite12) issue('err', i, 'Plus de ' + R.maxSuite12 + ' postes de 12 h d’affilée', HARD);
    }
    // 48 h sur 7 jours glissants (les heures après minuit comptent pour le jour suivant)
    var h = new Array(F + 1).fill(0);
    for (i = 0; i < F; i++) {
      var c = full[i];
      if (c === 'N') { h[i] += 5; h[i + 1] += R.hNuit - 5; } else if (isWork(c)) h[i] += hoursOf(c, s, R);
    }
    for (i = Math.max(off, 6); i < F; i++) {
      var sum = 0; for (k = i - 6; k <= i; k++) sum += h[k];
      if (sum > R.max7j + 0.01) issue('err', i, Math.round(sum * 10) / 10 + ' h sur 7 jours (max ' + R.max7j + ' h)', HARD);
    }
    // Repos hebdomadaire : au moins un vrai jour de repos (36 h) par semaine ; 4 repos sur 2 semaines dont 2 consécutifs avec un dimanche
    var weeks = {};
    for (i = 0; i < F; i++) { var w = Math.floor(days[i].abs / 7); (weeks[w] = weeks[w] || []).push(i); }
    Object.keys(weeks).forEach(function (w) {
      var idx = weeks[w]; if (idx.length < 7 || idx[6] < off) return;
      if (!idx.some(restDay)) issue('err', idx[6], 'Pas de repos de 36 h dans la semaine', HARD);
      if (+w % 2 === 1 && weeks[+w - 1] && weeks[+w - 1].length === 7) {
        var two = weeks[+w - 1].concat(idx), nb = two.filter(restDay).length;
        if (nb < 4) issue('err', idx[6], nb + ' jour(s) de repos sur 2 semaines (minimum 4)', HARD);
        var pair = two.some(function (x) { return days[x].dow === 0 && restDay(x) && (restDay(x - 1) || restDay(x + 1)); });
        if (!pair && !s.derogationDimanche) issue('err', idx[6], 'Pas de repos de 2 jours avec un dimanche sur 2 semaines', HARD);
      }
    });
    // Particularités de la personne
    var nights = 0, we = 0, thursdays = {};
    for (i = off; i < F; i++) {
      var code = full[i], d = days[i], di = i - off, u = unit ? unit[di] : null, wk = work(i);
      if (code === 'N') nights++;
      if (!wk) continue;
      if (code === 'N' && s.nuits === 'non' && !a.lock[di]) issue('err', i, 'Pas de nuit pour cette personne', HARD);
      if (s.agentNuit && code !== 'N' && code !== 'FC' && !a.lock[di]) issue('err', i, 'Agent de nuit : pas de poste de jour', HARD);
      if (code === 'B' && (d.we || d.hol) && !a.lock[di]) issue('err', i, 'Journée de 7 h hors semaine', HARD);
      if (s.joursAutorises && s.joursAutorises.length && s.joursAutorises.indexOf(d.dow) < 0 && !a.lock[di]) issue('err', i, 'Jour non travaillé par cette personne', HARD);
      var dw = s.desirs && s.desirs[d.dow];
      if (dw && dw.indexOf(code) >= 0 && !a.lock[di]) issue('err', i, code + ' exclu le ' + ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d.dow], HARD);
      if (s.maxParJour) { var mx = s.maxParJour[d.dow]; if (mx !== undefined) { thursdays[d.dow] = (thursdays[d.dow] || 0) + 1; if (thursdays[d.dow] > mx) issue('err', i, 'Plus de ' + mx + ' fois ce jour de la semaine dans le mois', HARD); } }
      if (u && u !== a.home && a.poly.indexOf(u) < 0) issue('err', i, 'Pas polyvalente pour cette unité', HARD);
      if (s.pasDeuxPostes && i > 0 && work(i - 1)) {
        var both = full[i - 1] === 'J' && code === 'J';
        if (s.pasDeuxPostes === 'jour' ? both : !(d.we && days[i - 1].we)) issue('err', i, s.pasDeuxPostes === 'jour' ? 'Deux postes de jour d’affilée' : 'Deux postes d’affilée hors week-end', HARD);
      }
      if (s.weRef && (d.we) && weekParity(d, s.weRef) !== 0 && !a.lock[di]) issue('err', i, 'Week-end de garde des enfants (alternance)', HARD);
    }
    // Week-ends
    var weList = [];
    for (i = off; i < F; i++) if (days[i].dow === 6) weList.push(i);
    weList.forEach(function (i0) {
      var sat = work(i0), sun = i0 + 1 < F && work(i0 + 1);
      if (sat || sun) we++;
      if (i0 + 1 < F && sat !== sun) pen += 120;
      if (s.weekendsTous && !(full[i0] === 'J' && full[i0 + 1] === 'J') && i0 + 1 < F) issue('warn', i0, 'Week-end non travaillé de jour (préférence)', 300);
    });
    if (days[off] && days[off].dow === 0 && a.pre.known && work(off) !== work(off - 1)) pen += 120;
    if (s.maxWE !== undefined && s.maxWE !== null && s.maxWE !== '' && we > +s.maxWE) issue('err', off, we + ' week-ends travaillés (max ' + s.maxWE + ')', HARD);
    // Préférences de nuits
    if (s.nuits === 'moins') pen += 70 * nights;
    if (s.nuits === 'plus') pen -= 50 * nights;
    // Heures du mois
    var hrs = 0;
    for (i = 0; i < D; i++) hrs += hoursOf(row[i], s, R);
    if (s.vacataire) pen += 150 * hrs;
    else { var dev = hrs - a.target; pen += a.wH * dev * dev; }
    // Petits confort : éviter les postes isolés, renfort plutôt que rien mais coûte un peu
    for (i = off; i < F; i++) {
      if ((full[i] === 'J' || full[i] === 'N') && !work(i - 1) && !work(i + 1) && i + 1 < F) pen += 12;
      if (unit && unit[i - off] && unit[i - off] !== a.home) pen += 15;
    }
    return pen;
  }
  function weekParity(d, ref) {
    var p = String(ref).split('-'), r = absDay(+p[0], +p[1], +p[2]);
    var w = Math.floor((d.abs - (d.dow === 0 ? 1 : 0) - r) / 7); // le dimanche appartient au week-end de la veille
    return ((w % 2) + 2) % 2;
  }

  /* ---------- couverture ---------- */
  function needOf(st, U, G, P, day) {
    var u = st.units.filter(function (x) { return x.id === U; })[0]; if (!u) return 0;
    var b = (u.besoins || {})[G] || {}; return +b[P] || 0;
  }
  function coverDay(st, rows, units, di) {
    var o = {};
    st.people.forEach(function (a, p) {
      var c = rows[p][di]; if (c !== 'J' && c !== 'N') return;
      var U = units[p][di] || a.home, k = U + '|' + a.g + '|' + c; o[k] = (o[k] || 0) + 1;
    });
    return o;
  }
  function coverPen(st, rows, units, di) {
    var cov = coverDay(st, rows, units, di), pen = 0, day = st.info.days[di];
    st.units.forEach(function (u) { ['inf', 'ap'].forEach(function (G) { POSTES.forEach(function (P) {
      var need = needOf(st, u.id, G, P, day), have = cov[u.id + '|' + G + '|' + P] || 0;
      if (have < need) pen += 5000 * (need - have); else if (have > need) pen += 600 * (have - need);
    }); }); });
    return pen;
  }

  /* ---------- générateur ---------- */
  function rng(seed) { var x = (seed >>> 0) || 1; return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1e9) / 1e9; }; }

  function generate(opts) {
    var st = buildState(opts), R = st.R, D = st.info.D, P = st.people, rand = rng(opts.seed || Date.now());
    var best = null;
    for (var rs = 0; rs < Math.max(1, R.restarts); rs++) {
      var res = solve(st, rand);
      if (!best || res.score < best.score) best = res;
    }
    var cells = {};
    (opts.staff || []).forEach(function (s) {
      var src = (opts.cells || {})[s.id] || {}, o = {};
      Object.keys(src).forEach(function (d) { var pc = parseCell(src[d]); if (trameActive(s, opts.plan) || pc.l || GEN.indexOf(pc.c) < 0) o[d] = src[d]; });
      cells[s.id] = o;
    });
    P.forEach(function (a, p) {
      var o = cells[a.s.id];
      for (var i = 0; i < D; i++) {
        if (a.lock[i]) continue;
        var c = best.rows[p][i], u = best.units[p][i];
        if (isWork(c)) o[i + 1] = c + (u && u !== a.home ? '@' + u : '');
        else if (i > 0 ? best.rows[p][i - 1] === 'N' : a.pre.codes[a.pre.codes.length - 1] === 'N') o[i + 1] = 'RPV';
      }
    });
    return { cells: cells, score: best.score };
  }

  function solve(st, rand) {
    var R = st.R, D = st.info.D, P = st.people, days = st.info.days;
    var rows = P.map(function (a) { return a.row.map(function (c, i) { return a.lock[i] ? c : ''; }); });
    var units = P.map(function (a) { return a.unit.map(function (u, i) { return a.lock[i] ? u : null; }); });
    var pPen = P.map(function (a, p) { return checkRow(st, a, rows[p], units[p]); });
    var dPen = days.map(function (d, i) { return coverPen(st, rows, units, i); });
    function domain(a, i) {
      var nuit = !!a.s.agentNuit, o = nuit ? ['', 'N'] : ['', 'J', 'N'];
      if (!nuit && !days[i].we && !days[i].hol) o.push('B');
      a.poly.forEach(function (U) { if (st.units.some(function (u) { return u.id === U; })) { if (!nuit) o.push('J@' + U); o.push('N@' + U); } });
      return o;
    }
    function set(p, i, v) { var k = v.indexOf('@'); rows[p][i] = k >= 0 ? v.slice(0, k) : v; units[p][i] = k >= 0 ? v.slice(k + 1) : null; }
    function get(p, i) { return rows[p][i] + (units[p][i] ? '@' + units[p][i] : ''); }
    var total = pPen.reduce(function (x, y) { return x + y; }, 0) + dPen.reduce(function (x, y) { return x + y; }, 0);

    // Construction gloutonne : chaque besoin du jour, par la personne la plus en retard d'heures
    var hrs = P.map(function () { return 0; });
    for (var i = 0; i < D; i++) {
      st.units.forEach(function (u) { ['inf', 'ap'].forEach(function (G) { POSTES.forEach(function (Pc) {
        var need = needOf(st, u.id, G, Pc, days[i]);
        for (var n = 0; n < need; n++) {
          var cov = coverDay(st, rows, units, i)[u.id + '|' + G + '|' + Pc] || 0; if (cov >= need) return;
          var bestP = -1, bestS = Infinity;
          P.forEach(function (a, p) {
            if (a.g !== G || a.lock[i] || rows[p][i]) return;
            if (a.home !== u.id && a.poly.indexOf(u.id) < 0) return;
            set(p, i, Pc + (a.home !== u.id ? '@' + u.id : ''));
            var pen = checkRow(st, a, rows[p], units[p]);
            set(p, i, '');
            if (pen >= HARD) return;
            var sc = pen - pPen[p] + (a.s.vacataire ? 400 : 0) + rand() * 20;
            if (sc < bestS) { bestS = sc; bestP = p; }
          });
          if (bestP >= 0) { set(bestP, i, Pc + (P[bestP].home !== u.id ? '@' + u.id : '')); pPen[bestP] = checkRow(st, P[bestP], rows[bestP], units[bestP]); }
        }
      }); }); });
    }
    // Compléter les heures avec des journées de 7 h en semaine
    P.forEach(function (a, p) {
      if (a.s.vacataire) return;
      for (var t = 0; t < D; t++) {
        var i = Math.floor(rand() * D); if (a.lock[i] || rows[p][i] || days[i].we || days[i].hol) continue;
        set(p, i, 'B'); var pen = checkRow(st, a, rows[p], units[p]);
        if (pen < pPen[p]) pPen[p] = pen; else set(p, i, '');
      }
    });
    dPen = days.map(function (d, i) { return coverPen(st, rows, units, i); });
    total = pPen.reduce(function (x, y) { return x + y; }, 0) + dPen.reduce(function (x, y) { return x + y; }, 0);

    // Recuit simulé
    var free = []; P.forEach(function (a, p) { for (var i = 0; i < D; i++) if (!a.lock[i]) free.push([p, i]); });
    if (!free.length) return { rows: rows, units: units, score: total };
    var N = R.iterations, T0 = 300, T1 = 1, bestScore = total, bestRows = rows.map(function (r) { return r.slice(); }), bestUnits = units.map(function (r) { return r.slice(); });
    for (var it = 0; it < N; it++) {
      var T = T0 * Math.pow(T1 / T0, it / N), mv = rand(), f = free[Math.floor(rand() * free.length)], p = f[0], i = f[1], a = P[p];
      var undo = [], touchedP = {}, touchedD = {};
      if (mv < 0.55) {
        var dom = domain(a, i), v = dom[Math.floor(rand() * dom.length)]; if (v === get(p, i)) continue;
        undo.push([p, i, get(p, i)]); set(p, i, v); touchedP[p] = 1; touchedD[i] = 1;
      } else if (mv < 0.85) { // échange avec une collègue du même groupe le même jour
        var q = Math.floor(rand() * P.length); if (q === p || P[q].g !== a.g || P[q].lock[i]) continue;
        var vp = get(p, i), vq = get(q, i); if (vp === vq) continue;
        var adapt = function (v, b) { var k = v.indexOf('@'); if (k < 0) return v && b.home !== a.home && v !== 'B' ? v + '@' + a.home : v; var U = v.slice(k + 1); return U === b.home ? v.slice(0, k) : v; };
        undo.push([p, i, vp], [q, i, vq]); set(p, i, adapt(vq, a)); set(q, i, adapt(vp, P[q])); touchedP[p] = 1; touchedP[q] = 1; touchedD[i] = 1;
      } else { // déplacer un jour de la même personne
        var j = Math.floor(rand() * D); if (j === i || a.lock[j]) continue;
        var vi = get(p, i), vj = get(p, j); if (vi === vj) continue;
        undo.push([p, i, vi], [p, j, vj]); set(p, i, vj); set(p, j, vi); touchedP[p] = 1; touchedD[i] = 1; touchedD[j] = 1;
      }
      var delta = 0, newP = {}, newD = {};
      Object.keys(touchedP).forEach(function (x) { newP[x] = checkRow(st, P[x], rows[x], units[x]); delta += newP[x] - pPen[x]; });
      Object.keys(touchedD).forEach(function (x) { newD[x] = coverPen(st, rows, units, +x); delta += newD[x] - dPen[x]; });
      if (delta <= 0 || rand() < Math.exp(-delta / T)) {
        Object.keys(newP).forEach(function (x) { pPen[x] = newP[x]; }); Object.keys(newD).forEach(function (x) { dPen[x] = newD[x]; });
        total += delta;
        if (total < bestScore) { bestScore = total; bestRows = rows.map(function (r) { return r.slice(); }); bestUnits = units.map(function (r) { return r.slice(); }); }
      } else for (var z = undo.length - 1; z >= 0; z--) set(undo[z][0], undo[z][1], undo[z][2]);
    }
    return { rows: bestRows, units: bestUnits, score: bestScore };
  }

  /* ---------- évaluation ---------- */
  function evaluate(opts) {
    var st = buildState(opts), R = st.R, D = st.info.D, P = st.people, issues = [];
    var rows = P.map(function (a) { return a.row; }), units = P.map(function (a) { return a.unit; });
    var people = P.map(function (a, p) {
      var out = []; checkRow(st, a, rows[p], units[p], out);
      out.forEach(function (x) { if (x.lvl === 'err' || x.lvl === 'warn') issues.push(x); });
      var hrs = 0, n = 0, j = 0, b = 0, we = 0, sun = 0, renf = 0;
      for (var i = 0; i < D; i++) {
        var c = rows[p][i]; hrs += hoursOf(c, a.s, R);
        if (c === 'N') n++; if (c === 'J') j++; if (c === 'B') b++;
        if (isWork(c) && units[p][i] && units[p][i] !== a.home) renf++;
        if (isWork(c) && st.info.days[i].dow === 0) sun++;
        if (st.info.days[i].dow === 6 && (isWork(c) || (i + 1 < D && isWork(rows[p][i + 1])))) we++;
      }
      if (st.info.days[0].dow === 0 && isWork(rows[p][0]) && !(a.pre.known && isWork(a.pre.codes[a.pre.codes.length - 1]))) we++;
      return { id: a.s.id, hours: Math.round(hrs * 100) / 100, theo: a.theo, target: a.target, balance: Math.round((hrs - a.theo) * 100) / 100,
        nights: n, jours: j, b: b, we: we, sundays: sun, renforts: renf };
    });
    var cover = [], missing = 0, excess = 0;
    for (var i = 0; i < D; i++) {
      var cov = coverDay(st, rows, units, i), o = {};
      st.units.forEach(function (u) { ['inf', 'ap'].forEach(function (G) { POSTES.forEach(function (Pc) {
        var need = needOf(st, u.id, G, Pc, st.info.days[i]); if (!need) return;
        var have = cov[u.id + '|' + G + '|' + Pc] || 0, k = u.id + '|' + G + '|' + Pc; o[k] = { have: have, need: need };
        if (have < need) { missing += need - have; issues.push({ lvl: 'err', d: i + 1, txt: (Pc === 'J' ? 'Jour' : 'Nuit') + ' ' + u.nom + ' (' + (G === 'ap' ? 'AP' : 'IDE/PDE') + ') : ' + have + ' / ' + need }); }
        else if (have > need) excess += have - need;
      }); }); });
      cover.push(o);
    }
    issues.sort(function (x, y) { return x.d - y.d; });
    return { info: st.info, people: people, cover: cover, missing: missing, excess: excess, issues: issues };
  }

  /* Qui peut prendre ce poste ? Liste les personnes possibles, de la plus en retard d'heures à la plus en avance. */
  function candidates(opts, day, poste, U, G) {
    var st = buildState(opts), out = [], di = day - 1;
    st.people.forEach(function (a) {
      if (a.g !== G || (a.home !== U && a.poly.indexOf(U) < 0)) return;
      if (a.lock[di] || a.row[di]) return;
      var before = [], after = [];
      checkRow(st, a, a.row, a.unit, before);
      var row = a.row.slice(), unit = a.unit.slice(); row[di] = poste; unit[di] = a.home !== U ? U : null;
      checkRow(st, a, row, unit, after);
      var key = function (x) { return x.d + x.txt; }, had = {}; before.forEach(function (x) { had[key(x)] = 1; });
      var added = after.filter(function (x) { return x.lvl === 'err' && !had[key(x)]; });
      var hrs = 0; for (var i = 0; i < st.info.D; i++) hrs += hoursOf(a.row[i], a.s, st.R);
      out.push({ id: a.s.id, ok: !added.length, why: added.map(function (x) { return x.txt; }).filter(function (t, k, arr) { return arr.indexOf(t) === k; }),
        retard: Math.round((a.target - hrs) * 100) / 100, renfort: a.home !== U, vacataire: !!a.s.vacataire });
    });
    out.sort(function (x, y) { return (y.ok - x.ok) || (x.vacataire - y.vacataire) || (y.retard - x.retard); });
    return out;
  }

  var api = { POSTES: POSTES, DEFAULT_RULES: DEFAULT_RULES, rulesOf: rulesOf, parseCell: parseCell, isWork: isWork, groupOf: groupOf,
    holidaysDefault: holidaysDefault, trameActive: trameActive, monthInfo: monthInfo, theoretical: theoretical, hoursOf: hoursOf,
    generate: generate, evaluate: evaluate, candidates: candidates };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Planner = api;
})(this);
