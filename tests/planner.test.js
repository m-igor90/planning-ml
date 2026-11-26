const test = require('node:test');
const assert = require('node:assert');
const P = require('../planner.js');
const ex = require('../exemple.json');

const team = ex.team, plan = ex.plans['2027-01'];
const base = { staff: team.staff, units: team.units, rules: team.rules, year: 2027, month: 1, plan, holidays: plan.holidays };
const carry = Object.fromEntries(team.staff.map(s => [s.id, s.soldeInitial || 0]));
const mini = [
  { id: 'a', qualif: 'PDE', unite: 'U', taux: 100 }, { id: 'b', qualif: 'PDE', unite: 'U', taux: 100 }
];
const U = [{ id: 'U', nom: 'Unité', besoins: { inf: { J: 0, N: 0 }, ap: { J: 0, N: 0 } } }];
const ev = (cells, staff = mini) => P.evaluate({ staff, units: U, rules: {}, year: 2027, month: 1, holidays: [1], cells });
const errs = (e, id) => e.issues.filter(i => i.sid === id && i.lvl === 'err').map(i => i.d + ' ' + i.txt);

test('janvier de l’exemple : tous les postes couverts, demandes et trames fixes gardées', () => {
  const res = P.generate({ ...base, cells: plan.cells, carry, seed: 1 });
  const e = P.evaluate({ ...base, cells: res.cells, carry });
  assert.strictEqual(e.missing, 0);
  const rules = e.issues.filter(i => i.sid && i.lvl === 'err' && !['So', 'El2'].includes(i.sid));
  assert.deepStrictEqual(rules, [], 'seules les trames fixes peuvent rester en alerte');
  for (const id of ['So', 'El2']) assert.deepStrictEqual(res.cells[id], plan.cells[id]);
  for (const [id, row] of Object.entries(plan.cells)) for (const d of Object.keys(row)) assert.strictEqual(res.cells[id][d], row[d], id + ' le ' + d);
  // repos de veille après chaque dernière nuit
  for (const [id, row] of Object.entries(res.cells)) for (let d = 1; d < 31; d++) if (P.parseCell(row[d]).c === 'N' && P.parseCell(row[d + 1]).c !== 'N') assert.ok(!P.isWork(P.parseCell(row[d + 1]).c), id + ' ' + d);
});

test('règles : nuit puis jour, 48 h sur 7 jours, repos sur deux semaines', () => {
  assert.ok(errs(ev({ a: { 5: 'N', 6: 'J' } }), 'a').some(t => /lendemain d’une nuit/.test(t)));
  assert.ok(errs(ev({ a: { 4: 'J', 5: 'J', 6: 'J', 8: 'J', 9: 'B' } }), 'a').some(t => /sur 7 jours/.test(t)), '55 h sur 7 jours');
  // du 4 au 24 janvier, formation tous les jours sauf un repos tous les 6 jours → moins de 4 repos sur 2 semaines, aucun dimanche
  const c = {}; for (let d = 4; d <= 24; d++) if (![7, 13, 19].includes(d)) c[d] = 'FC';
  const t = errs(ev({ a: c }), 'a').join(' | ');
  assert.ok(/repos sur 2 semaines/.test(t) && /dimanche/.test(t), t);
});

test('particularités : pas de nuit, jours autorisés, alternance des week-ends', () => {
  const staff = [{ id: 'a', qualif: 'PDE', unite: 'U', taux: 100, nuits: 'non', joursAutorises: [3, 6, 0], weRef: '2027-01-09' }];
  const t = errs(ev({ a: { 6: 'N', 7: 'J', 16: 'J' } }, staff), 'a').join(' | ');
  assert.ok(/Pas de nuit/.test(t) && /Jour non travaillé/.test(t) && /alternance/.test(t), t);
});

test('« Qui peut venir ? » : personnes possibles d’abord, avec la raison des refus', () => {
  const staff = [{ id: 'a', qualif: 'PDE', unite: 'U', taux: 100 }, { id: 'b', qualif: 'PDE', unite: 'U', taux: 100, nuits: 'non' }, { id: 'c', qualif: 'AP', unite: 'U', taux: 100 }];
  const list = P.candidates({ staff, units: U, rules: {}, year: 2027, month: 1, holidays: [1], cells: {} }, 12, 'N', 'U', 'inf');
  assert.deepStrictEqual(list.map(x => x.id), ['a', 'b']);
  assert.ok(list[0].ok && !list[1].ok && /Pas de nuit/.test(list[1].why.join()));
});

test('temps théorique : 7 h par jour ouvré au prorata, 32h30 pour un agent de nuit', () => {
  const info = P.monthInfo(2027, 1, [1]);
  assert.strictEqual(P.theoretical({ id: 'x', taux: 100 }, info), 140);
  assert.strictEqual(P.theoretical({ id: 'x', taux: 80 }, info), 112);
  assert.strictEqual(P.theoretical({ id: 'x', taux: 100, agentNuit: true }, info), 130);
});
