// Banc de mesure du moteur : janvier 2027 (exemple) puis février et mars enchaînés, sur plusieurs graines.
// Usage : node tests/bench.js [nombre de graines, 6 par défaut] [v = détail des postes non couverts]
// Reproduit l'interface : une trame fixe sans case dans le mois est générée (plan.trameAuto).
const path = require('path');
const P = require(path.join(__dirname, '..', 'planner.js'));
const ex = require(path.join(__dirname, '..', 'exemple.json'));
const team = ex.team, staff = team.staff, seeds = +(process.argv[2] || 6), detail = process.argv[3] === 'v';
const vac = id => !!staff.find(s => s.id === id).vacataire, agg = {}, t0 = Date.now();
for (let sd = 1; sd <= seeds; sd++) {
  let carry = Object.fromEntries(staff.map(s => [s.id, +s.soldeInitial || 0])), prev = null;
  for (const [y, m] of [[2027, 1], [2027, 2], [2027, 3]]) {
    const k = y + '-' + String(m).padStart(2, '0');
    const plan = JSON.parse(JSON.stringify(ex.plans[k] || { holidays: P.holidaysDefault(y, m), cells: {} }));
    staff.forEach(s => { if (s.trameFixe && !Object.keys(plan.cells[s.id] || {}).length) (plan.trameAuto = plan.trameAuto || {})[s.id] = true; });
    const base = { staff, units: team.units, rules: team.rules, year: y, month: m, plan, holidays: plan.holidays, prev };
    const res = P.generate({ ...base, cells: plan.cells, carry, seed: sd * 7919 });
    const ev = P.evaluate({ ...base, cells: res.cells, carry });
    const non = ev.people.filter(p => !vac(p.id));
    ev.people.forEach(p => { carry[p.id] += p.balance; });
    const cums = staff.filter(s => !s.vacataire).map(s => carry[s.id]), moy = cums.reduce((a, x) => a + x, 0) / cums.length;
    (agg[k] = agg[k] || []).push({
      manquants: ev.missing, alertes: ev.issues.filter(i => i.sid && i.lvl === 'err').length,
      ecart: non.reduce((a, p) => a + Math.abs(p.hours - p.target), 0) / non.length,
      vacataire: ev.people.filter(p => vac(p.id)).reduce((a, p) => a + p.hours, 0),
      dispersion: Math.sqrt(cums.reduce((a, x) => a + (x - moy) ** 2, 0) / cums.length),
      detail: ev.issues.filter(i => !i.sid).map(i => i.d + ' ' + i.txt)
    });
    prev = { year: y, month: m, holidays: plan.holidays, cells: res.cells };
  }
}
for (const k of Object.keys(agg)) {
  const a = agg[k], f = n => (a.reduce((s, x) => s + x[n], 0) / a.length).toFixed(1);
  console.log(k, '| non couverts', f('manquants'), '[' + a.map(x => x.manquants) + '] | alertes', f('alertes'), '| écart à la cible', f('ecart'), 'h | vacataire', f('vacataire'), 'h | dispersion des cumuls', f('dispersion'), 'h');
  if (detail) a.forEach(x => x.detail.length && console.log('   ', x.detail.join(' ; ')));
}
console.log('durée moyenne :', ((Date.now() - t0) / 1000 / seeds / 3).toFixed(2), 's par mois');
