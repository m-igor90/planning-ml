# Planning du service

Application web de démonstration pour planifier le mois d'un service de soins à postes de 12 h :
deux unités, Néo et Kang (IDE/PDE et AP), avec renforts entre unités.
Une seule page (`index.html`) et le moteur (`planner.js`), sans installation ni serveur.

En ligne : https://m-igor90.github.io/planning-ml/

## Utilisation

- **Générer le planning** : remplit le mois en gardant les saisies à la main (coin bleu), les congés (CA), formations
  (FC), repos souhaités (RsA), repos temps partiel (Rtp) et les trames fixes. « Annuler » revient en arrière.
- **Saisie** : choisir un code puis toucher les cases. 🔒 fixe une case pour le générateur, ⌫ la vide.
  **Plusieurs jours d'un coup** : glisser de la première à la dernière case (au doigt : appui long, puis glisser) ;
  CA, FC et B ne sont posés que du lundi au vendredi hors fériés. Ctrl+Z annule.
- La grille montre aussi les 3 derniers jours du mois précédent et les 3 premiers du suivant (grisés). L'en-tête des
  jours reste visible en descendant ; sur ordinateur, les colonnes se resserrent pour éviter la barre de défilement.
- **Lignes de couverture** (sous chaque équipe) : rouge = poste manquant. Touchez un chiffre pour voir **qui peut
  venir** : les personnes possibles, de la plus en retard d'heures à la plus en avance, renforts et vacataire signalés,
  avec la raison quand une personne ne peut pas.
- **Compteurs** par personne : heures / temps théorique, solde du mois, cumul (TTE reporté), nuits, week-ends.
- **Contrôles** : liste des alertes réglementaires et des préférences non respectées ; les cases concernées sont
  surlignées.
- **Indicateurs** (sous la grille) : couverture, heures et cumul de l'équipe, vacataire, renforts, absences, équité des
  nuits et des week-ends, suivi des mois planifiés.
- **Imprimer** (une page A4 paysage, en couleurs) et **Exporter (CSV)** pour Excel.
- **Sauvegarder** (en haut à droite) : télécharge toutes les données dans un fichier daté ; un rappel s'affiche après
  7 jours de modifications non sauvegardées.
- **Équipe & règles** : une fiche par personne, les besoins par unité et par poste, les règles, les jours fériés,
  la sauvegarde (JSON).

Les données sont enregistrées dans le navigateur (clé `planning-ml-v1`, distincte de `planning-test`) et ne sont pas
partagées entre appareils : utiliser l'export JSON pour changer d'appareil.

## Codes

| Code | Signification | Heures |
| --- | --- | --- |
| J | Jour 7h–19h | 12 h |
| N | Nuit 19h–7h | 12h50 (réglable) |
| CA | Congé annuel | 7 h × taux |
| FC | Formation | 7 h |
| RH, RC, Rtp, JF, RPV | Repos hebdomadaire, compensateur, temps partiel, férié, de veille | 0 |
| RsA | Repos souhaité (demande) | 0 |
| Ext | En prêt dans un autre service (heures comptées là-bas) | 0 |

Les jours de repos reçoivent automatiquement leur code (en petit gris) : 2 RH par semaine, le dimanche et le samedi
d'abord ; les Rtp des temps partiels ; JF les jours fériés ; RC le reste. Un code posé à la main est gardé. Le B100 du
prévisionnel (case provisoire) n'est plus généré : le générateur choisit directement jour, nuit ou repos.

`J@KAN` : jour en renfort dans l'unité Kang (affiché « J » avec l'initiale de l'unité).

## Règles appliquées par le générateur

- Couverture par unité, fonction et poste (réglable) : Néo 2 IDE/PDE de jour et de nuit ; Kang 1 IDE/PDE
  et 1 AP de jour et de nuit. Le renfort d'une personne polyvalente est préféré aux heures supplémentaires.
- Repos de veille après une nuit, puis un repos (2 jours au total, réglable par personne) ; 12 h entre deux postes ;
  au plus 2 nuits, 3 postes de 12 h et 5 jours de travail d'affilée (réglables).
- 48 h au plus sur 7 jours glissants (les heures après minuit comptent pour le jour suivant ; la nuit y compte 12 h
  effectives, les 50 min de compensation restant dans les heures du mois).
- Un repos de 36 h chaque semaine ; 4 repos sur 2 semaines, dont 2 consécutifs avec un dimanche.
- Week-ends (nuit du vendredi, samedi, dimanche) : au plus un sur deux travaillé, et jamais coupé (samedi et dimanche
  ensemble, ou nuits du vendredi et du samedi). Les deux règles se désactivent dans « Équipe & règles ».
- Particularités par personne : pas de nuit / moins / plus, agent de nuit (32h30, uniquement des nuits), trame fixe
  (si elle n'est pas saisie pour le mois, la ligne est générée et signalée « à vérifier »), vacataire (minimum
  nécessaire), jours travaillés autorisés, jours sans journée ou sans nuit, limite d'un jour de la semaine par mois,
  pas 2 postes d'affilée, alternance des week-ends (garde alternée), un week-end sur deux travaillé, week-ends par mois au plus, priorité au temps théorique.
- Équilibre des heures : chacune vise son temps théorique, corrigé de son cumul TTE de quelques heures par mois
  (24 h au plus par défaut) pour rapprocher les compteurs de leur « solde visé ».
- Continuité : la fin du mois précédent (14 jours) est prise en compte pour les nuits, les repos et les 48 h.

## Exemple

`exemple.json` reprend janvier 2027 à partir des documents du service : équipe (prénoms réduits à 2 lettres, numérotés
en cas de doublon, sans matricule), particularités, temps théoriques, congés, demandes, trames fixes et cumuls TTE de
décembre. Le prévisionnel lui-même n'est pas inclus.

## Tests

```
node --test tests/*.test.js
node tests/bench.js
```

`tests/bench.js` mesure le moteur sur janvier, février et mars enchaînés (postes non couverts, alertes, écart aux
cibles, vacataire, dispersion des cumuls).
