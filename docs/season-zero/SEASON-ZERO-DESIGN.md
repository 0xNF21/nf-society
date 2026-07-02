# Season Zero - Product Design

Status: implementation en cours
Owner decision: founder
Date: 2026-05-08

---

## 1. Decision recommandee

Season Zero est une saison courte de skill, avec rewards DAO apres review.

Format recommande:

- Duree: 14 jours
- Jeux rewardes: Dames, Relics, Memory
- Jeux non rewardes: Morpion, PFC, CRC Races, tous les chance games
- Score: points de saison sur matchs humains authentifies
- Pool: 250 CRC DAO, fixe et annonce avant le lancement
- Distribution: top 5, apres snapshot + review anti-cheat
- Claim: allocation claimable apres la saison, pas de payout par partie

Pourquoi:

- Dames, Relics et Memory donnent le meilleur signal de skill dans les jeux existants.
- Morpion est trop solve/draw-heavy pour un classement rewarde, mais parfait pour onboarding.
- PFC est trop variance/guessing.
- CRC Races est fun mais N-player, plus complexe a auditer en Season Zero.
- Les chance games doivent rester Fragments/XP/badges uniquement.

---

## 2. Rails legal/security

Non-negociable:

1. Aucun top-up CRC.
2. Aucune mise CRC.
3. Aucun pot joueur.
4. Aucun payout CRC instantane en fin de partie.
5. Aucun jeu de hasard dans le classement CRC.
6. Les CRC viennent d'un pool DAO annonce a l'avance.
7. Les matchs comptes exigent une session auth valide pour les deux joueurs.
8. Le score ne depend jamais du montant de Fragments engage.

Les Fragments restent OK comme rail de participation, car ils sont virtuels,
non withdrawables, et non convertibles en CRC. Mais Season Zero ne doit jamais
donner un avantage de score a celui qui engage plus de Fragments.

Promesse joueur:

> Joue gratuitement avec des Fragments, monte dans le classement Season Zero, puis
> les meilleurs joueurs recoivent une reward DAO en CRC apres validation.

---

## 3. Jeux inclus

| Jeu | Role Season Zero |
|---|---|
| Dames | Main skill game, meilleur signal competitif. |
| Relics | Strategie + deduction, bon format court. |
| Memory | Skill accessible, memorisation + vitesse. |
| Morpion | Onboarding Fragments/XP/badge uniquement, pas de CRC. |
| PFC | Exclu rewards, trop variance. |
| CRC Races | Exclu Season Zero, a retester plus tard. |
| Chance games | Exclu rewards CRC strictement. |

Decision produit importante: Season Zero ne cherche pas a inclure tous les
jeux. Elle cherche a etre defendable, simple, et facile a auditer.

---

## 4. Scoring MVP

Un match eligible:

- jeu inclus dans Season Zero,
- deux joueurs humains authentifies,
- adresses differentes,
- statut final `finished`,
- pas demo/test/bot,
- pas cancelled,
- resultat exploitable.

Points:

| Resultat | Points |
|---|---:|
| Victoire | 10 |
| Defaite terminee | 2 |
| Abandon / timeout / invalid | 0 |
| Match annule | 0 |

Caps anti-grind:

- max 30 matchs comptes par joueur,
- max 12 matchs comptes par jeu,
- max 5 matchs comptes contre la meme adresse,
- minimum 10 matchs valides pour etre eligible aux rewards,
- minimum 3 adversaires uniques.

Tie-breakers:

1. Adversaires uniques.
2. Nombre de victoires.
3. Win rate, avec minimum 10 matchs.
4. Meilleur score sur Dames.
5. Date d'atteinte du score, le plus tot gagne.

Pourquoi ce scoring:

- tres explicable aux joueurs,
- pas besoin d'Elo en v0,
- limite le farming,
- encourage les joueurs a finir les parties,
- victoire reste 5x plus importante qu'une defaite terminee.

---

## 5. Rewards

Pool recommande: 250 CRC.

Distribution top 5:

| Rang | Part | Si pool 250 CRC |
|---|---:|---:|
| 1 | 40% | 100 CRC |
| 2 | 25% | 62.5 CRC |
| 3 | 15% | 37.5 CRC |
| 4 | 12% | 30 CRC |
| 5 | 8% | 20 CRC |

Si 30+ joueurs qualifies, on peut passer top 10 dans une saison future. Pour
Season Zero, top 5 garde le scope simple.

Flow claim:

1. Saison terminee.
2. Snapshot leaderboard.
3. Review anti-cheat 48h.
4. `reward_allocations` creees.
5. UI affiche "Reward DAO claimable".
6. Joueur claim via le rail `dao_reward`.

Important: aucune reward CRC n'est creee avant la validation finale.

---

## 6. Anti-cheat MVP

Automatique:

- session auth obligatoire,
- adresse session = adresse du slot joueur,
- self-play interdit,
- caps adversaire / jeu / total,
- matchs demo/test/bot exclus,
- montant de Fragments ignore dans le score.

Review manuelle:

Flagger si:

- beaucoup de matchs contre une seule adresse,
- victoires tres rapides et repetees,
- patterns reciproques suspects entre deux comptes,
- beaucoup d'abandons beneficient au meme joueur,
- nouveau wallet joue uniquement contre un petit groupe ferme.

Regle publique:

> Le classement est provisoire jusqu'a validation anti-cheat. Les rewards DAO
> peuvent etre ajustees en cas d'abus manifeste.

---

## 7. UX cible

Page cible: `/season-zero`.

La page doit servir de lobby de saison, pas seulement de page de regles:

- afficher uniquement les jeux choisis pour la saison,
- envoyer directement vers les lobbies Dames / Relics / Memory,
- garder un lien vers les parties ouvertes,
- afficher les regles et le leaderboard sous le lobby.

Les jeux de saison doivent etre configurables depuis l'admin:

- `enabled`: le jeu appartient a la saison,
- `visibleInLobby`: le jeu apparait dans le lobby de saison,
- `countsForLeaderboard`: le jeu compte dans le score,
- les jeux non encore supportes par le scoring peuvent rester "lobby only".

Pendant la saison:

- temps restant,
- pool CRC DAO,
- mon rang,
- mes points,
- matchs valides,
- adversaires uniques,
- leaderboard provisoire,
- regles courtes.

Textes a afficher clairement:

- "Classement provisoire"
- "Rewards DAO apres validation"
- "Aucune mise CRC"
- "Les Fragments servent a jouer, pas a acheter un rang"

Apres la saison:

- snapshot final,
- etat "review en cours" pendant 48h,
- puis claim ouvert pour les joueurs eligibles.

---

## 8. Implications DB plus tard

No code dans cette phase. Mais la prochaine PR DB devrait probablement creer:

- `seasons`
- `season_games`
- `season_matches`
- `season_scores`
- `reward_allocations`

Recommendation technique:

- Snapshotter les matchs eligibles dans `season_matches`.
- Calculer `season_scores` depuis ce snapshot.
- Ne pas recalculer le classement directement depuis les tables de jeux a chaque affichage.

Pourquoi: audit plus clair, review anti-cheat plus simple, score stable apres
finalisation.

---

## 9. Decisions founder avant code

Mes recommandations par defaut:

1. Pool: 250 CRC.
2. Duree: 14 jours.
3. Jeux rewardes: Dames, Relics, Memory.
4. Morpion: onboarding Fragments/XP/badge uniquement.
5. Distribution: top 5.
6. Review anti-cheat: founder decide, Claude/Codex aident a produire les flags.
7. Privacy: joueur masque du leaderboard = non eligible tant qu'il ne re-active pas son affichage avant fin de saison.

Questions a trancher:

1. Tu valides 250 CRC ou tu veux commencer plus bas ?
2. Tu veux lancer quand ?
3. Tu acceptes d'exclure Morpion du classement CRC ?
4. Tu veux top 5 seulement ou top 10 des le debut ?

---

## 10. Preparation avant date

La date de lancement doit rester la derniere decision. Avant de l'annoncer,
il faut pouvoir faire tourner tout le systeme en mode preparation:

- migration Neon appliquee,
- saison `draft` creee automatiquement en base par l'app,
- jeux de saison par defaut sauvegardes automatiquement dans `season_games`,
- leaderboard dry-run visible et stable,
- regles publiques alignees avec le code,
- endpoint admin pret a programmer la fenetre officielle,
- aucune distribution CRC declenchee au lancement.

Le flux normal est automatique: une visite de `/season-zero` ou de l'onglet
admin Saison suffit a maintenir le draft et les jeux prets, tant que les tables
Neon existent. Quand ces points sont OK, il reste seulement a renseigner
`startAt` / `endAt` via la config ou l'endpoint admin de schedule.

---

## 11. Definition of done MVP

Season Zero est prete quand:

- les regles sont publiques,
- la page saison existe,
- les matchs eligibles sont snapshots,
- les scores sont auditables,
- les caps anti-grind sont appliques,
- les allocations sont creees apres review,
- le claim utilise `dao_reward`,
- aucun payout CRC n'arrive depuis une partie individuelle.

Pas besoin en v0:

- Elo,
- matchmaking automatique,
- bracket tournament,
- admin dashboard parfait,
- moderation complete.

Season Zero doit etre simple, visible, defendable.
