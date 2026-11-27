# planning-ml — notes pour Claude Code

Planning mensuel d'un service hospitalier à postes de 12 h, demandé par une cadre de santé (« ML ») qui gère
plusieurs équipes. Démo publiée sur GitHub Pages : https://m-igor90.github.io/planning-ml/ (branche `main`, dossier
racine). Dérivé de `m-igor90/planning-test` (même style d'interface), mais le moteur est propre à ce service.
Tout en français : interface, code, commentaires, messages de commit.

## Organisation

- `index.html` : page unique (styles, interface). Pas de dépendance ni d'étape de build.
  Sous la grille, panneau « Indicateurs » (`renderKpi`, `statsMois`, `suiviMois`) : couverture, heures, cumul TTE,
  vacataire, renforts, absences, équité nuits/week-ends, suivi des mois planifiés. Saisie par glisser (`paintRange`),
  largeur des jours ajustée à l'écran (`ajusterLargeur`).
- `planner.js` : moteur (`window.Planner` / `module.exports`) : `generate`, `evaluate`, `candidates`
  (« Qui peut venir ? »), `theoretical`, `holidaysDefault` (France). Construction gloutonne puis recuit simulé,
  environ 1 s pour un mois.
- `exemple.json` : janvier 2027 tiré des documents du service, chargé au premier lancement.
- `tests/planner.test.js` : `node --test tests/*.test.js` (8 tests). `node tests/bench.js` : mesure du moteur sur 3 mois.
- Clé localStorage `planning-ml-v1` (distincte de `planning-test`, même origine GitHub Pages).
- Version affichée dans l'en-tête (`Démo · V1.6.0`) et `?v=ml-1.6.0` sur `planner.js` : les augmenter ensemble.

## Service modélisé

- Deux unités, nommées « Néo » (`NEO`) et « Kang » (`KAN`) pour l'anonymat. Fonctions : IDE/PDE (groupe `inf`) et AP
  (groupe `ap`) ; cadre hors planning.
- Besoins par jour, réglables : NEO 2 IDE/PDE de jour et de nuit ; KAN 1 IDE/PDE et 1 AP de jour et de nuit.
- Codes : J (7h-19h, 12 h), N (19h-7h, valeur 12h50), CA (congé, 7 h × taux), FC (formation 7 h), RsA, Rtp, RH, RC,
  RPV, JF, Ext (en prêt dans un autre service, 0 h ici, compte comme travaillé pour les règles). `J@KAN` = renfort
  dans une autre unité. B (B100 du prévisionnel) n'est plus généré : c'est une case provisoire, à transformer en J, N
  ou repos (gardé pour les anciennes données, 7 h × taux).
- Nature des repos (`reposLabels`, calculée à l'affichage, jamais enregistrée) : 2 RH par semaine lundi-dimanche
  (dimanche puis samedi d'abord, jamais le lendemain d'une nuit), Rtp = (100 − taux) % des jours ouvrés du mois,
  JF = férié non travaillé, RC = le reste ; codes posés à la main gardés et comptés ; rien pour la vacataire.
  Préfixe `!` = case fixée. CA, FC, RsA, Rtp, JF et les lignes « trame fixe » ne sont jamais modifiés, sauf une trame
  fixe sans aucune case dans le mois : `plan.trameAuto[id]`, ligne générée et signalée « à vérifier » (bouton « Garder
  comme trame »). Un agent de nuit ne reçoit que des nuits.
- Règles (documents « Réglementation planning ») : repos de veille après une nuit puis repos, 12 h entre deux
  postes, 48 h sur 7 jours glissants (heures après minuit sur le lendemain ; la nuit y compte 12 h effectives,
  `hNuit48`, les 50 min étant une compensation comptée dans les heures du mois), 36 h de repos par semaine, 4 repos
  sur 2 semaines dont 2 consécutifs avec un dimanche. Renfort entre unités préféré aux heures supplémentaires.
- Temps théorique : 7 h par jour ouvré au prorata du taux (agent de nuit : 32h30/35), surchargeable par mois.
- Équilibre des heures : cible = théorique corrigé du cumul TTE (rattrapage 24 h par mois au plus) vers le
  « solde visé » de la personne.
- Vacataire : coût élevé par heure, utilisée le moins possible.
- « Tous les week-ends travaillés » (`weekendsTous`, Sa) = un week-end sur deux, samedi et dimanche de jour. Week-end
  de référence : `weTravailRef` de la fiche, sinon dernier week-end travaillé du mois précédent, sinon la parité qui
  heurte le moins les congés posés ; ces week-ends sont posés avant la construction gloutonne.

## Données et confidentialité

- Les documents d'origine (Word et Excel du service) ne sont pas dans le dépôt et ne doivent pas y être ajoutés.
- Prénoms réduits aux 2 premières lettres ; en cas de doublon, 3 lettres choisies pour rester reconnaissables par la
  cadre (Mar, Mae, Mat, Emi, Eme, Ann, Ank, Elo, Ely). Aucun prénom complet, nom ni matricule dans le dépôt ; cadre exclue.
- Unités : seulement « Néo » et « Kang » dans l'interface et la documentation, jamais le nom complet du service.
- Anciens identifiants (Ma1…El2, V1.1.0) : `migrer()` dans `index.html` renomme les données déjà enregistrées dans le
  navigateur (personnes dans `cells`, `theo`, `adjust` ; noms d'unités).

## Résultat de référence (janvier 2027)

Prévisionnel du service : 14 postes non couverts, 41 alertes, écart moyen à la cible 39 h.
Généré : 0 poste non couvert, 0 alerte depuis V1.6.0 (avant : 2 alertes sur les trames fixes, nuit comptée 12h50 dans
les 48 h), écart moyen 21 h.
Enchaînement janvier → mars (`node tests/bench.js`, 6 graines, V1.6.0) : 0 poste non couvert, 0 alerte, écart moyen
à la cible 21, 4 et 6 h, dispersion des cumuls 21, 20 et 16 h, vacataire 0 à 2 h par mois. L'écart de mars passe de
2,4 h (V1.4.0) à 6 h car il n'y a plus de B pour compléter les heures : le manque devient du repos (RC, Rtp).
Avant V1.4.0 : So et Ely (trames fixes de nuit) restaient à 0 h dès février, d'où nuits non couvertes et cumuls qui divergeaient.

## Réponses de la responsable (27 novembre 2026)

- AP de Néo : planning à part (1 AP de jour en 12 h, plus des renforts en biberonnerie selon les besoins) : hors de
  cette application.
- 48 h sur 7 jours : la nuit compte 12 h effectives ; les 50 min sont une compensation (gardées dans les heures).
- B100 : case provisoire, transformée en jour de 12 h, nuit de 12h50, RC ou Rtp selon les manques : plus générée.
- Eme : garder 65 h au compteur (solde visé 65) : confirmé.
- Alternance des week-ends d'Ank et Is : respecter celle du prévisionnel de janvier (`weRef`) : confirmé.
- « R » gris au-dessus de Lo du 1er au 3 janvier : prêt au SAU ; affectée à Kang à partir du 4 (code Ext du 1er au 3).
- Postes de 7 h de la légende : obsolètes. RC, Rtp et RH doivent être différenciés sur le planning rendu (dimanches,
  arrêts maladie) : `reposLabels`.
- Renforts vers les autres services : non gérés, confirmé.
- « Tous les week-ends travaillés » = tous ceux à travailler, soit un week-end sur deux.

## Questions en attente pour la responsable

1. Quelle est la 4e équipe ?
2. Nature des repos : 2 RH par semaine (lundi-dimanche), le dimanche d'abord ? Rtp = (100 − taux) % des jours ouvrés
   du mois ? JF sur un férié non travaillé ? RC pour tous les autres repos ? Le RPV reste-t-il RPV sur le planning rendu ?
3. Repos souhaités (RsA) : sur le planning rendu, faut-il les transformer en RH ou RC ? (codé : RsA reste affiché)
4. Arrêt maladie : faut-il un code, et comment compter ses heures (le poste prévu, ou 7 h par jour) ?
5. Lo du 1er au 3 janvier au SAU : ses heures comptent-elles dans son compteur ici ? (codé : 0 h dans ce planning)
6. Sa : quel est son week-end de référence ? (codé : suite du mois précédent, sinon celui qui heurte le moins ses congés)
7. Congé posé en glissant sur une semaine : CA, FC et Rtp ne sont posés que du lundi au vendredi, hors fériés. Les CA
   se comptent-ils en jours ouvrés, ou faut-il aussi les poser le samedi ou le week-end ?
8. Trames fixes (So, Ely) : suivent-elles un cycle (2, 3, 4 semaines ?) à prolonger automatiquement, ou sont-elles
   refaites chaque mois ? (codé : si la trame du mois n'est pas saisie, la ligne est générée et signalée « à vérifier »)
9. Agent de nuit : peut-il exceptionnellement faire un jour (J) ? (codé : jamais)
10. Rattrapage des heures : au plus 24 h par mois et par personne vers le solde visé ; avec l'exemple, le cumul de
    l'équipe passe d'environ 1 150 h fin janvier à 700-850 h fin février. Est-ce le bon rythme ?
11. Vacataire (Ann) : plafond d'heures par mois, jours possibles ? (codé : dernier recours, sans compteur)
12. Indicateurs : lesquels sont suivis ou demandés (direction des soins, contrôle de gestion) : couverture, heures
    supplémentaires, recours à la vacataire ou à l'intérim, absentéisme ? Sous quelle forme ?
13. Jour férié travaillé : compensation à poser automatiquement ?
14. Impression : affichage au mur ? Une page A4 paysage suffit-elle, ou faut-il de l'A3 ?

## Points ouverts

- Interface testée dans Chromium (Playwright) : PC de 1280 à 2560 px, téléphones et tablette simulés (iPhone 13, Pixel 7,
  iPad Mini), mode sombre, impression PDF. Le geste au doigt (appui long puis glisser) reste à vérifier sur un vrai
  téléphone, surtout un iPhone.
- Pistes : import direct des exports Excel du logiciel du service, distinction RH/RC, postes de 7 h.

## Méthode de travail souhaitée

- Mesurer avant et après chaque changement du moteur sur janvier 2027 (postes manquants, alertes, écart aux
  cibles, dispersion des cumuls).
- Publier sur `main` sans demander, dès qu'un changement est testé (tests Node + essai dans Chromium) : commit sur la
  branche de travail, puis `git push origin HEAD:main`, puis vérifier le déploiement GitHub Pages (check-runs du commit
  ou `repos/m-igor90/planning-ml/deployments`). La responsable ne veut pas qu'on s'arrête pour demander l'autorisation.
