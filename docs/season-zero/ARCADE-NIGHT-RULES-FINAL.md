# NF Arcade Night #1 - Final Rules

Status: founder-approved beta rules
Owner decision: founder
Date: 2026-07-07

This document is the canonical rules brief for the first closed beta Arcade
Night. Code for scoring, leaderboard, review, and rewards should implement this
document, not reinterpret the longer product exploration docs.

---

## 1. Event Format

NF Arcade Night #1 is a short closed beta event for a small group of NF Society
community members.

Default configuration:

- Duration: 90 minutes.
- Pool: 5000 CRC DAO reward pool.
- Games: Memory + Dames.
- Participation: Fragments only.
- CRC: DAO reward after review only.
- Audience: closed beta, a few trusted NF Society members.

The founder can adjust date, duration, pool, beta participants, active games,
and caps from the admin panel:

> `/admin` -> `Arcade Night`

---

## 2. Legal Rails

Non-negotiable rules:

1. No CRC stake.
2. No CRC top-up for playable balance.
3. No player-funded pot.
4. No random CRC payout.
5. No instant CRC reward at match end.
6. CRC rewards come from a DAO pool announced before the event.
7. Rewards are distributed only after manual review.

Public wording:

> Rewards CRC are DAO rewards after review. No CRC stake, no player-funded pot.

---

## 3. Why Separate Leaderboards

Memory and Dames do not have the same match duration.

Problem:

- Memory is usually faster.
- Dames can take longer.
- In a 90-minute window, a Memory-only player can naturally finish more matches
  than a Dames-only player.
- A global leaderboard would reward match speed more than skill.

Decision:

- Memory leaderboard and Dames leaderboard are separate.
- No global winner for beta #1.
- Rewards are allocated per game.

This is the key fairness rule for Arcade Night #1.

---

## 4. Eligible Match

A match counts only if all conditions are true:

- Match starts during the event window.
- Game is enabled for the event.
- Both players have a valid wallet-auth session.
- Player addresses are different.
- Match finishes with a usable result.
- Match is not demo, bot, cancelled, test, or admin-forced.
- Match is not flagged as abusive during review.

Fragments amount does not affect score.

If a match starts before the event or after the event, it does not count.

If a match starts during the event but finishes shortly after the window, it can
count if the scoring implementation can safely verify the start time. If this is
not reliable in the first implementation, use the conservative rule:

> Only matches finished during the event window count.

Codex/Claude should choose one implementation rule explicitly in the scoring PR
and document it.

---

## 5. Points

Same point system for Memory and Dames:

| Result | Points |
|---|---:|
| Win | 10 |
| Draw | 5 |
| Finished loss | 2 |
| Abandon / timeout / invalid | 0 |
| Cancelled | 0 |

Why give 2 points for a finished loss:

- Encourages players to finish matches.
- Reduces frustration for weaker players.
- Still keeps a win worth 5x a loss.

---

## 6. Caps

Caps are per player, per game.

### Memory

- Max counted matches: 6.
- Max counted matches against the same wallet: 3.
- Minimum valid matches for reward eligibility: 3.
- Minimum unique opponents for reward eligibility: 2.

### Dames

- Max counted matches: 3.
- Max counted matches against the same wallet: 2.
- Minimum valid matches for reward eligibility: 2.
- Minimum unique opponents for reward eligibility: 2.

Matches above caps can still exist in the app, but they do not add leaderboard
points.

---

## 7. Ranking

Each game has its own ranking.

Primary sort:

1. Total counted points.

Tie-breakers:

1. Unique opponents.
2. Wins.
3. Win rate.
4. Finished counted matches.
5. Earliest time reaching the final score.

If a tie is still ambiguous after these rules, founder decision wins for beta #1.

---

## 8. Rewards

Default pool: 5000 CRC.

Default distribution:

| Reward | Amount |
|---|---:|
| Memory #1 | 1500 CRC |
| Memory #2 | 750 CRC |
| Dames #1 | 1500 CRC |
| Dames #2 | 750 CRC |
| Beta helper / bug report / fair play | 500 CRC |

The admin panel currently derives this as:

- 30% Memory #1
- 15% Memory #2
- 30% Dames #1
- 15% Dames #2
- 10% beta helper

If the founder edits the pool, the amounts scale automatically.

---

## 9. Anti-Concentration Rule

Default beta #1 rule:

- One wallet can receive only one competitive reward.
- If the same wallet is rewardable on Memory and Dames, it keeps the larger
  reward.
- The freed slot moves to the next eligible player on that game leaderboard.
- If rewards are equal, founder chooses which reward the wallet keeps.
- The beta helper reward should preferably go to someone who did not already
  receive a competitive reward.

Founder decision is final for weird beta cases.

---

## 10. Manual Review

Before rewards are distributed, review:

- Top players per game.
- Repeated matches against same wallet.
- Very fast repeated wins.
- Abandons/timeouts benefiting the same wallet.
- New wallets only playing against one small group.
- Any player support reports during the event.

Public rule:

> The leaderboard is provisional until review. NF Society can exclude abusive
> matches or coordinated accounts.

---

## 11. Code Requirements For Scoring PR

The scoring PR should produce, at minimum:

- Event-aware query for Memory matches.
- Event-aware query for Dames matches.
- Per-game points.
- Per-game caps.
- Per-game eligibility.
- Per-game provisional leaderboard.
- Anti-concentration reward projection.
- Admin-visible review state or export.

The first implementation can be snapshot/manual-triggered. It does not need
real-time perfect scoring if that would increase risk.

Preferred rollout:

1. Build dry-run scoring with no payouts.
2. Compare output manually after test games.
3. Add admin snapshot/finalize only after dry-run is trusted.
4. Add reward allocation/claim in a later PR.

---

## 12. Out Of Scope For Beta #1

Do not build yet:

- Global leaderboard.
- Elo/MMR.
- Bracket or elimination tournament.
- Automatic matchmaking.
- Random rewards.
- Top 10 distribution.
- Relics scoring.
- CRC Races scoring.
- Claim/payout automation in the same PR as scoring.

Arcade Night #1 should stay small, auditable, and easy to explain.
