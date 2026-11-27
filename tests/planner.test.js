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
  // sans les règles de week-end (un sur deux, non coupés), janvier se couvre entièrement
  const libre = { ...base, rules: { weEntier: 0, weUnSurDeux: 0 } };
  const res = P.generate({ ...libre, cells: plan.cells, carry, seed: 1 });
  const e = P.evaluate({ ...libre, cells: res.cells, carry });
  assert.strictEqual(e.missing, 0);
  const rules = e.issues.filter(i => i.sid && i.lvl === 'err' && !['So', 'Ely'].includes(i.sid));
  assert.deepStrictEqual(rules, [], 'seules les trames fixes peuvent rester en alerte');
  for (const id of ['So', 'Ely']) assert.deepStrictEqual(res.cells[id], plan.cells[id]);
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

test('agent de nuit : jamais de poste de jour ; trame fixe non saisie générée seulement si demandé', () => {
  const night = { id: 'n', qualif: 'IDE', unite: 'U', taux: 100, agentNuit: true, trameFixe: true };
  const day = { id: 'd', qualif: 'IDE', unite: 'U', taux: 100 };
  const units = [{ id: 'U', nom: 'Unité', besoins: { inf: { J: 1, N: 1 }, ap: { J: 0, N: 0 } } }];
  const base = { staff: [night, day], units, rules: { iterations: 20000 }, year: 2027, month: 2, holidays: [], cells: {}, seed: 3 };
  // trame fixe sans case et sans trameAuto : la ligne reste vide
  assert.deepStrictEqual(P.generate({ ...base, plan: {} }).cells.n, {});
  // trameAuto : la ligne est générée, uniquement des nuits (et repos de veille)
  const res = P.generate({ ...base, plan: { trameAuto: { n: true } } });
  const codes = Object.values(res.cells.n).map(v => P.parseCell(v).c);
  assert.ok(codes.includes('N'), 'des nuits');
  assert.ok(codes.every(c => c === 'N' || c === 'RPV'), codes.join(','));
  assert.ok(P.evaluate({ ...base, plan: {}, staff: [{ ...night, trameFixe: false }], cells: { n: { 3: 'J' } } }).issues.some(i => /Agent de nuit/.test(i.txt)));
});

test('réponses de la responsable : nuit à 12 h pour les 48 h, plus de B, un week-end sur deux', () => {
  // 4 nuits de 12h50 sur 7 jours = 51h20 mais 48 h effectives : pas d'alerte
  const e = ev({ a: { 4: 'N', 5: 'N', 8: 'N', 9: 'N' } });
  assert.ok(!errs(e, 'a').some(t => /sur 7 jours/.test(t)), errs(e, 'a').join(' | '));
  assert.strictEqual(e.people.find(p => p.id === 'a').hours, 51.33, 'les heures du mois gardent 12h50');
  // aucune journée B générée
  const res = P.generate({ ...base, cells: plan.cells, carry, seed: 2 });
  assert.ok(Object.values(res.cells).every(r => Object.values(r).every(v => P.parseCell(v).c !== 'B')));
  // Sa : un week-end sur deux, samedi et dimanche de jour
  const e2 = P.evaluate({ ...base, cells: res.cells, carry });
  assert.deepStrictEqual(e2.issues.filter(i => i.sid === 'Sa' && /un sur deux|un week-end sur deux/.test(i.txt)), []);
  const sats = [2, 9, 16, 23, 30].map(d => P.parseCell(res.cells.Sa[d]).c === 'J' && P.parseCell(res.cells.Sa[d + 1]).c === 'J');
  assert.ok(sats.every((w, k) => k === 0 || w !== sats[k - 1]), 'alternance : ' + sats.join(','));
});

test('nature des repos : 2 RH par semaine dont le dimanche, Rtp des temps partiels, JF, RC', () => {
  const staff = [{ id: 'p', qualif: 'PDE', unite: 'U', taux: 80 }, { id: 'v', qualif: 'IDE', unite: 'U', taux: 100, vacataire: true }];
  // février 2027 : 4 semaines pleines du lundi 1er au dimanche 28, 20 jours ouvrés
  const cells = { p: { 3: 'J', 4: 'J', 10: 'N', 11: 'N', 12: 'RPV', 17: 'J', 18: 'J', 24: 'J', 25: 'J', 28: 'J', 15: '!RC' } };
  const L = P.reposLabels({ staff, year: 2027, month: 2, holidays: [], cells });
  const n = c => Object.values(L.p).filter(x => x === c).length;
  assert.strictEqual(n('RH'), 8);
  assert.strictEqual(n('Rtp'), 4);
  assert.ok(['7', '14', '21'].every(d => L.p[d] === 'RH'), 'dimanches libres en RH');
  assert.strictEqual(L.p[28], undefined, 'jour travaillé non étiqueté');
  assert.strictEqual(L.p[12], undefined, 'RPV gardé');
  assert.strictEqual(L.p[15], undefined, 'code posé à la main gardé');
  assert.deepStrictEqual(L.v, undefined, 'rien pour la vacataire');
  const tot = Object.keys(L.p).length + Object.keys(cells.p).length;
  assert.strictEqual(tot, 28);
  assert.strictEqual(P.reposLabels({ staff, year: 2027, month: 5, holidays: [1, 8, 13, 24], cells: {} }).p[13], 'JF');
});

test('week-ends : au plus un sur deux (nuit du vendredi comprise), jamais coupés', () => {
  const st = [{ id: 'a', qualif: 'PDE', unite: 'U', taux: 100 }];
  const t = c => errs(ev({ a: c }, st), 'a').join(' | ');
  assert.match(t({ 9: 'J', 10: 'J', 15: 'N', 16: 'RPV' }), /Deux week-ends de suite/, 'nuit du vendredi = week-end');
  assert.match(t({ 9: 'J' }), /Week-end coupé/);
  assert.doesNotMatch(t({ 8: 'N', 9: 'N', 10: 'RPV' }), /coupé/, 'nuits du vendredi et du samedi');
  assert.doesNotMatch(t({ 15: 'N', 16: 'RPV' }), /coupé|de suite/, 'nuit du vendredi seule');
  assert.strictEqual(t({ 2: 'J', 3: 'J', 16: 'N', 17: 'N', 30: 'J', 31: 'J' }).match(/week-end/gi), null);
  // janvier de l'exemple : personne d'autre que So (trame fixe) ne travaille deux week-ends de suite
  const res = P.generate({ ...base, cells: plan.cells, carry, seed: 3 });
  const e = P.evaluate({ ...base, cells: res.cells, carry });
  assert.deepStrictEqual(e.issues.filter(i => /de suite/.test(i.txt) && i.sid !== 'So').map(i => i.sid + ' ' + i.d), []);
  assert.ok(e.missing <= 6, e.missing + ' postes non couverts');
});
