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
- `tests/planner.test.js` : `node --test tests/*.test.js` (6 tests). `node tests/bench.js` : mesure du moteur sur 3 mois.
- Clé localStorage `planning-ml-v1` (distincte de `planning-test`, même origine GitHub Pages).
- Version affichée dans l'en-tête (`Démo · V1.5.1`) et `?v=ml-1.5.1` sur `planner.js` : les augmenter ensemble.

## Service modélisé

- Deux unités, nommées « Néo » (`NEO`) et « Kang » (`KAN`) pour l'anonymat. Fonctions : IDE/PDE (groupe `inf`) et AP
  (groupe `ap`) ; cadre hors planning.
- Besoins par jour, réglables : NEO 2 IDE/PDE de jour et de nuit ; KAN 1 IDE/PDE et 1 AP de jour et de nuit.
- Codes : J (7h-19h, 12 h), N (19h-7h, valeur 12h50), B (journée de 7 h en semaine, équivalent B100, au prorata),
  CA (congé, 7 h × taux), FC (formation 7 h), RsA, Rtp, RH, RC, RPV, JF. `J@KAN` = renfort dans une autre unité.
  Préfixe `!` = case fixée. CA, FC, RsA, Rtp, JF et les lignes « trame fixe » ne sont jamais modifiés, sauf une trame
  fixe sans aucune case dans le mois : `plan.trameAuto[id]`, ligne générée et signalée « à vérifier » (bouton « Garder
  comme trame »). Un agent de nuit ne reçoit que des nuits.
- Règles (documents « Réglementation planning ») : repos de veille après une nuit puis repos, 12 h entre deux
  postes, 48 h sur 7 jours glissants (heures après minuit sur le lendemain), 36 h de repos par semaine, 4 repos
  sur 2 semaines dont 2 consécutifs avec un dimanche. Renfort entre unités préféré aux heures supplémentaires.
- Temps théorique : 7 h par jour ouvré au prorata du taux (agent de nuit : 32h30/35), surchargeable par mois.
- Équilibre des heures : cible = théorique corrigé du cumul TTE (rattrapage 24 h par mois au plus) vers le
  « solde visé » de la personne.
- Vacataire : coût élevé par heure, utilisée le moins possible.

## Données et confidentialité

- Les documents d'origine (Word et Excel du service) ne sont pas dans le dépôt et ne doivent pas y être ajoutés.
- Prénoms réduits aux 2 premières lettres ; en cas de doublon, 3 lettres choisies pour rester reconnaissables par la
  cadre (Mar, Mae, Mat, Emi, Eme, Ann, Ank, Elo, Ely). Aucun prénom complet, nom ni matricule dans le dépôt ; cadre exclue.
- Unités : seulement « Néo » et « Kang » dans l'interface et la documentation, jamais le nom complet du service.
- Anciens identifiants (Ma1…El2, V1.1.0) : `migrer()` dans `index.html` renomme les données déjà enregistrées dans le
  navigateur (personnes dans `cells`, `theo`, `adjust` ; noms d'unités).

## Résultat de référence (janvier 2027)

Prévisionnel du service : 14 postes non couverts, 41 alertes, écart moyen à la cible 39 h.
Généré : 0 poste non couvert, 2 alertes (trames fixes à plus de 48 h sur 7 jours avec la nuit à 12h50),
écart moyen 21 h.
Enchaînement janvier → mars (`node tests/bench.js`, 6 graines, V1.5.1) : février et mars 0 poste
non couvert, écart moyen à la cible 4,9 h et 2,4 h, dispersion des cumuls 19 h puis 16 h, vacataire 2 à 6 h par mois.
Avant V1.5.1 : So et Ely (trames fixes de nuit) restaient à 0 h dès février, d'où nuits non couvertes et cumuls qui divergeaient.

## Questions en attente pour la responsable

1. Quelle est la 4e équipe ? Y a-t-il des AP en Néo, combien par poste ?
2. 48 h sur 7 jours : nuit comptée 12 h effectives ou 12h50 ?
3. B100 « jour potentiel travaillable » : journée de 7 h réellement travaillée (quels horaires) ou réserve ?
4. « Garder une marge de 65 h sup » (Eme) : garder 65 h au compteur ou ne pas dépasser 65 h ? (codé : solde visé 65)
5. Alternance des week-ends (Ank, Is) déduite de janvier : à confirmer.
6. « R » gris au-dessus de Lo du 1er au 3 janvier : signification ?
7. Postes de 7 h de la légende (6h25, 13h, 20h45) utilisés ? Faut-il distinguer RH et RC ?
8. Renforts vers les autres services (USC, SAU, maternité, grands enfants) à gérer ?
9. Congé posé en glissant sur une semaine : CA, FC et B ne sont posés que du lundi au vendredi, hors fériés. Les CA se
   comptent-ils en jours ouvrés, ou faut-il aussi les poser le samedi ou le week-end ?
10. Trames fixes (So, Ely) : suivent-elles un cycle (2, 3, 4 semaines ?) à prolonger automatiquement, ou sont-elles
    refaites chaque mois ? (codé : si la trame du mois n'est pas saisie, la ligne est générée et signalée « à vérifier »)
11. Agent de nuit : peut-il exceptionnellement faire un jour (J) ou une journée de 7 h (B) ? (codé : jamais)
12. Rattrapage des heures : au plus 24 h par mois et par personne vers le solde visé ; avec l'exemple, le cumul de
    l'équipe passe d'environ 1 150 h fin janvier à 700-850 h fin février. Est-ce le bon rythme ?
13. Vacataire (Ann) : plafond d'heures par mois, jours possibles ? (codé : dernier recours, sans compteur)
14. Indicateurs : lesquels sont suivis ou demandés (direction des soins, contrôle de gestion) : couverture, heures
    supplémentaires, recours à la vacataire ou à l'intérim, absentéisme ? Sous quelle forme ?
15. Jour férié travaillé : compensation (RC ou JF) à poser automatiquement ?
16. Impression : affichage au mur ? Une page A4 paysage suffit-elle, ou faut-il de l'A3 ?

Particularités volontairement traitées comme préférences : « tous les week-ends travaillés » (conflit avec le
repos d'un dimanche toutes les 2 semaines).

## Points ouverts

- Interface testée seulement avec un faux DOM sous Node : vérifier le rendu réel sur téléphone et sur PC.
- Pistes : import direct des exports Excel du logiciel du service, distinction RH/RC, postes de 7 h.

## Méthode de travail souhaitée

- Mesurer avant et après chaque changement du moteur sur janvier 2027 (postes manquants, alertes, écart aux
  cibles, dispersion des cumuls).
- Publier sur `main` sans demander, dès qu'un changement est testé (tests Node + essai dans Chromium) : commit sur la
  branche de travail, puis `git push origin HEAD:main`, puis vérifier le déploiement GitHub Pages (check-runs du commit
  ou `repos/m-igor90/planning-ml/deployments`). La responsable ne veut pas qu'on s'arrête pour demander l'autorisation.
