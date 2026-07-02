# Arcade Night V1 - Product Spec

Status: product decision draft
Owner decision: founder
Date: 2026-07-02

## 1. Decision

Avant de lancer une vraie ligue longue, NF Society commence par des evenements
courts de type **Arcade Night**.

Le but n'est pas encore de prouver une saison reguliere. Le but est de creer un
rendez-vous vivant, faire jouer plusieurs personnes en meme temps, tester les
rails techniques en conditions reelles, puis apprendre vite.

Format recommande:

- Duree: 1h30 a 2h
- Frequence initiale: 1 fois par semaine ou par quinzaine
- Jeux V1: Memory + Dames
- Format: leaderboards separes par jeu
- Pas d'elimination directe en V1
- Rewards: dotation par jeu + reward beta utile
- Participation: Fragments uniquement
- CRC: reward DAO finale, jamais mise joueur
- Audience #1: beta fermee avec quelques membres de la communaute NF Society

## 2. Pourquoi pas une ligue longue tout de suite

Une ligue de 7 a 14 jours est plus ambitieuse, mais elle peut sembler vide si les
joueurs ne jouent pas au meme moment.

Arcade Night est plus adaptee au stade actuel:

- elle cree un moment social clair: "viens ce soir a 20h";
- elle concentre les joueurs en meme temps;
- elle teste auth, multi, mobile, leaderboard, support et Telegram rapidement;
- elle limite l'impact d'un bug;
- elle donne plusieurs occasions de revenir avant de lancer une vraie saison.

La ligue reste l'objectif suivant, mais apres 2 ou 3 Arcade Nights reussies.

## 3. Pourquoi pas elimination directe

L'elimination directe est seduisante, mais trop fragile pour la V1:

- un joueur elimine au premier match n'a plus rien a faire;
- un absent casse le bracket;
- il faut plus de moderation live;
- le format marche mal avec peu de joueurs;
- les joueurs debutants peuvent etre frustres tres vite.

Le leaderboard sprint est plus tolerant:

- tout le monde peut continuer a jouer;
- les late joiners peuvent encore participer;
- les no-shows ne bloquent pas l'event;
- les caps anti-farm gardent le classement defendable.

## 4. Format V1

Nom public possible:

- Arcade Night
- NF Arcade Night
- Season Zero Sprint

Decision recommandee:

> NF Arcade Night

Une Arcade Night est un mini-event score sur une fenetre courte.

Pour la premiere beta, le but principal n'est pas de designer le classement
global parfait. Le but est de tester:

- connexion wallet;
- creation / join de parties;
- mobile;
- scoring;
- leaderboard;
- support live;
- friction Fragments;
- comprehension des rewards.

Fenetre:

- 90 minutes par defaut
- extension possible a 120 minutes si la communaute est active

Exemple:

- Jeudi 20:00 -> 21:30 Europe/Paris
- Review: 15 a 30 minutes apres la fin
- Rewards publiees dans la soiree si tout est propre

## 5. Jeux inclus V1

### Inclus

| Jeu | Pourquoi |
|---|---|
| Memory | Accessible, rapide, deja teste, bon pour onboarding. |
| Dames | Plus skill, donne de la profondeur competitive. |

### Pas inclus V1

| Jeu | Pourquoi |
|---|---|
| Relics | Interessant, mais a ajouter apres stabilisation des deux premiers. |
| Morpion | Trop solve/draw-heavy pour reward CRC, utile en onboarding hors classement. |
| PFC | Trop proche du guessing/variance. |
| CRC Races | N-player plus complexe a auditer. |
| Chance games | Hors rewards CRC. |

## 6. Scoring V1

Decision importante:

> La premiere beta n'utilise pas de leaderboard global unique.

Probleme:

- une partie de Memory est souvent plus courte;
- une partie de Dames peut durer beaucoup plus longtemps;
- sur 90 minutes, un joueur Memory peut faire plus de matchs et donc plus de
  points qu'un joueur Dames;
- un classement global simple avantagerait donc le jeu le plus rapide.

Solution V1:

- leaderboard Memory separe;
- leaderboard Dames separe;
- pas de couronne "meilleur joueur global" pour la beta #1.

Points par jeu:

| Resultat | Points |
|---|---:|
| Victoire | 10 |
| Nul | 5 |
| Defaite terminee | 2 |
| Abandon / timeout / invalid | 0 |

Caps Memory:

- max 6 matchs comptes par joueur;
- max 3 matchs comptes contre la meme adresse;
- minimum 3 matchs valides pour etre eligible;
- minimum 2 adversaires uniques pour etre eligible.

Caps Dames:

- max 3 matchs comptes par joueur;
- max 2 matchs comptes contre la meme adresse;
- minimum 2 matchs valides pour etre eligible;
- minimum 2 adversaires uniques pour etre eligible.

Tie-breakers:

1. adversaires uniques;
2. nombre de victoires;
3. win rate;
4. nombre de matchs termines;
5. premiere atteinte du score.

Pourquoi ces caps:

- garder le format lisible;
- limiter le farming entre deux wallets;
- eviter que Memory domine Dames par vitesse;
- permettre a un joueur motive de participer sans devoir jouer toute la nuit.

## 7. Rewards V1

Dotation recommandee pour la premiere beta:

- 5000 CRC total, environ 50 EUR selon l'hypothese actuelle.

Distribution recommandee:

| Reward | Montant |
|---|---:|
| Memory #1 | 1500 CRC |
| Memory #2 | 750 CRC |
| Dames #1 | 1500 CRC |
| Dames #2 | 750 CRC |
| Beta helper / bug report / fair play | 500 CRC |

Pourquoi:

- rend l'event assez attractif pour mobiliser la communaute;
- partage la dotation entre plusieurs joueurs;
- encourage les retours utiles;
- evite d'avoir un top 3 global injuste;
- garde une partie de la dotation pour recompenser l'aide concrete pendant la beta.

Regle anti-concentration beta #1:

- un wallet ne peut recevoir qu'une seule reward competitive par defaut;
- si le meme wallet finit rewardable sur Memory et Dames, il garde la plus grosse
  reward et l'autre slot descend au prochain joueur eligible du leaderboard
  concerne;
- la reward beta helper va de preference a un joueur qui n'a pas deja recu une
  reward competitive;
- le founder garde la decision finale en cas de cas bizarre.

Option si tout marche tres bien sur les prochaines editions:

- augmenter la dotation;
- ajouter Relics si Memory/Dames sont stables;
- tester un classement global pondere seulement apres plusieurs events.

Les rewards sont des rewards DAO apres review, pas des gains de partie.

Message public:

> Les rewards CRC sont distribuees par le DAO apres verification. Aucune mise
> CRC, aucun pot joueur.

## 8. Anti-cheat V1

Automatique:

- session auth obligatoire;
- deux wallets differents;
- match termine uniquement;
- caps par joueur, par jeu, par adversaire;
- partie hors fenetre ignoree;
- jeu hors event ignore;
- montant de Fragments ignore dans le score.

Review manuelle:

- regarder les winners par jeu avant distribution;
- verifier matchs repetes contre meme wallet;
- verifier abandons suspects;
- verifier patterns de comptes recents;
- choisir manuellement la reward beta helper si besoin;
- founder garde la decision finale.

Regle publique:

> Le classement reste provisoire jusqu'a review. NF Society peut exclure les
> matchs abusifs ou comptes manifestement coordonnes.

## 9. UX joueur

Avant l'event:

- page event avec date, heure, jeux, pool, regles courtes;
- bouton "Me prevenir / rejoindre le Discord ou Telegram";
- CTA "S'entrainer" vers Memory/Dames hors classement.

Pendant l'event:

- timer restant;
- bouton Jouer Memory;
- bouton Jouer Dames;
- mon score Memory;
- mon score Dames;
- mon eligibility par jeu;
- leaderboard Memory;
- leaderboard Dames;
- message clair si le wallet n'est pas connecte;
- message clair si une partie ne compte pas.

Apres l'event:

- etat "review en cours";
- winners provisoires par jeu;
- puis winners finaux;
- claim ou distribution reward selon le rail retenu.

## 10. UX admin minimum

Pour V1, l'admin doit pouvoir:

- creer/configurer un event court;
- definir start/end;
- choisir Memory/Dames;
- definir pool/rewards par jeu;
- lancer un snapshot;
- voir les flags anti-cheat simples;
- finaliser les rewards;
- exporter scores/matchs.

Ce qui peut rester manuel au debut:

- annonce Telegram/Discord;
- verification winners par jeu;
- decision d'exclusion;
- timing exact de publication des rewards.

## 11. Schema / implementation

La foundation `seasons` peut representer une Arcade Night.

Mapping:

- `seasons.slug`: `arcade-night-YYYY-MM-DD` ou `season-zero-night-1`
- `seasons.title`: `NF Arcade Night #1`
- `start_at` / `end_at`: fenetre de 90 minutes
- `pool_crc`: 5000 pour la premiere beta
- `season_games`: Memory + Dames
- `season_scores`: snapshot final
- `season_reward_allocations`: winners par jeu + reward beta helper apres review

Pas besoin d'un schema separe `tournaments` en V1.

On peut ajouter plus tard:

- brackets;
- equipes;
- formats elimination;
- ligues longues;
- calendrier multi-events.

## 12. Rollout recommande

### Arcade Night #1 - beta controlee

Objectif:

- 4 a 10 joueurs;
- tester Memory/Dames;
- tester deux leaderboards separes;
- tester support live;
- ne pas chercher la perfection.

Pool:

- 5000 CRC.

Rewards:

- Memory #1: 1500 CRC;
- Memory #2: 750 CRC;
- Dames #1: 1500 CRC;
- Dames #2: 750 CRC;
- Beta helper / bug report / fair play: 500 CRC.

Communication:

- Discord/Telegram + message direct aux proches/testeurs.

### Arcade Night #2

Objectif:

- repeter avec corrections;
- augmenter un peu la clarte UX;
- peut-etre ajouter Relics si #1 est stable.

### Arcade Night #3

Objectif:

- valider que les gens reviennent;
- decider si on lance une ligue courte de 7 jours.

## 13. Non-objectifs V1

Ne pas faire maintenant:

- elimination directe;
- bracket;
- matchmaking automatique;
- Elo/MMR;
- ligue 14 jours;
- rewards top 10;
- Relics si Memory/Dames ne sont pas encore stables;
- sponsors externes;
- shop skins;
- Season pass;
- claims CRC complexes si une distribution admin suffit pour le premier test.

## 14. Decisions ouvertes

1. Nom final: `NF Arcade Night` ou `Season Zero Sprint` ?
2. Pool #1: 5000 CRC valide ?
3. Jour/heure cible: jeudi soir, vendredi soir, dimanche soir ?
4. Rewards: claim self-service ou distribution admin pour le premier event ?
5. Liste beta #1: quels membres NF Society inviter ?

## 15. Recommandation finale

Decision recommandee pour la premiere execution:

- Nom: NF Arcade Night #1
- Duree: 90 minutes
- Jeux: Memory + Dames
- Pool: 5000 CRC
- Rewards: Memory #1/#2, Dames #1/#2, beta helper
- Distribution: apres review manuelle
- Audience: beta fermee NF Society
- Objectif principal: prouver que plusieurs joueurs peuvent venir jouer au meme
  moment, jouer sans bug majeur, comprendre deux classements separes et donner
  des retours utiles.
