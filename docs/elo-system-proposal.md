# A Healthier Rating System for No Shot

**A data-driven proposal for replacing the current ELO and matchmaking design**

*Prepared from Monte Carlo season simulations (30 simulated seasons per configuration, 2,000 matches per season) run against the recorded match history of the community ladder — 45 rated players with 10+ matches, drawn from 251 tracked accounts and 240 fully-reconstructed 4v4 matches. Re-simulated July 2026 on refreshed match data.*

---

## 1. Executive summary

The current ranked system has two structural problems that compound each other:

1. **The snake-draft matchmaker systematically favors the higher-rated seat.** Because picks 1, 4, 5, 8 always go to the same side, the team holding the top seat carries a real rating edge whenever the ladder has a gap at the top — and ours does. In simulation the snake leaves a **median team-rating gap of ~11–12 ELO** (optimal balancing brings this to ~1–2), and the higher-rated side wins measurably more often. Measured directly from recorded matches, **the higher-rated team wins 54.6%** of decisive games — rating predicts outcome, so a matchmaker that hands the same player the rating edge hands them a standing advantage.
2. **The current rating formula cannot correct it.** A favored team still banks a guaranteed minimum for wins it was always going to get, so a permanently favored seat farms rating with no equilibrium — and because the current system **has no rating floor**, the players who keep losing sink without limit. The ladder pulls apart from both ends: a runaway top and a free-falling bottom. *(The unbounded-spread projection quantifying this — σ→604, a #1 seat past 5,000 ELO — comes from the earlier full-history analysis and is retained in §2.2; it models the current min-clamped formula, which the present simulator does not reproduce.)*

We propose a three-layer replacement — **optimal team balancing, expected-score match payouts, and rating-relative performance credit** — that in simulation:

- converges to the **same ladder from any starting point** (current ratings, a fresh reset, or even under the old snake matchmaking) — per-player final ratings agree across starting points at **correlation 0.85**,
- keeps team win rates at **~46/46** with no structurally favored side,
- reaches a **stable, bounded ladder** — the spread converges instead of pulling apart without end — and adds a rating floor that protects the bottom without inflating the economy,
- makes stats matter *more*, and in chosen proportion — stat-to-rating correlation rises from **0.65 / 0.58 / 0.02** (goals / assists / saves under today's ratings) to **0.83 / 0.77 / 0.24**, turning defense from statistically invisible into a rated contribution,
- and **never breaks the basic contract**: winners always gain ELO, losers always lose ELO, no matter how well or badly an individual performed.

Migration is gentle: starting from today's ratings, the system *converges* rather than resets — players drift to their earned level over roughly one season of play.

---

## 2. The problem, measured

### 2.1 The snake draft has a built-in bias

The live matchmaker sorts the 8-player lobby by ELO and deals picks **1, 4, 5, 8** to Blue and **2, 3, 6, 7** to Red. This balances *rank sums* (1+4+5+8 = 2+3+6+7), but it only balances *ELO* if ratings are evenly spaced. The moment the ladder has a gap at the top — and ours does — the team holding pick #1 inherits that entire gap.

Measured from recorded match history (218 decisive, fully-reconstructed 4v4 matches):

| Metric | Value |
|---|---|
| Higher-rated team win rate | **54.6%** |
| Simulated median team-rating gap under the snake | **~11–12 ELO** |
| Simulated median team-rating gap under optimal balancing | **~1–2 ELO** |

The same player occupies the top seat in most lobbies, so this is not noise that averages out — it is a standing edge handed to whoever is ranked #1, sitting on top of the gap that creates it.

### 2.2 The rating formula amplifies it

*The figures in this subsection are retained from the earlier full-history analysis and are illustrative, not re-simulated. Two caveats apply: the present simulator models the **proposed** expected-score system, so it does not re-derive them; and that earlier model assumed a rating floor, whereas the **live system has none**. Read this as the **spread-and-concentration** failure mode — a runaway top and a free-falling bottom — rather than net inflation of the economy.*

The earlier simulator was seeded with the actual current ladder and the snake rule, then projected 4,000–5,000 future matches per season across 20 independent seasons. Result:

| Metric | Current system (projected, prior analysis) |
|---|---|
| Ladder std. deviation | 83 → **604** (accelerating, no equilibrium) |
| Highest player rating | **~5,300** |
| Top seat's net rating gain vs. stat-justified level | **+2,200** |
| Lowest player rating | **free-falls without bound** — the current system has no floor |

The mechanism: the delta formula guarantees a minimum gain per win. A team favored by hundreds of points still banks that minimum on every near-certain victory — so a permanently favored seat farms rating forever, drained from its opponents, with no equilibrium. The rating it gains is transferred off the players who keep losing, and with no floor to catch them, they sink without limit. The economy is not necessarily minting points — it is tearing the ladder apart.

**Validation note:** the earlier simulator was not tuned to produce this — fed only the current ratings and the snake rule, it independently reproduced the measured Blue bias of the day. The present re-simulation independently confirms the *mechanism's premise* on fresh data: rating genuinely predicts outcome (higher-rated team wins 54.6%), so a seat-based rating edge is a real competitive edge.

---

## 3. The proposed system

Three layers, each fixing a failure mode the simulations isolated. Each layer was tested independently; the failure of any one layer alone is documented in section 4.

### 3.1 Matchmaking: optimal split

With 8 players there are only **35 possible 4v4 splits**. Enumerate all of them, pick the split with the smallest average-ELO difference, break ties randomly, assign sides randomly.

- Strictly better balance than the snake (median team gap drops from **~11–12** to **~1–2 ELO**).
- No seat is owned by anyone: balancing errors land on random sides and average out per player, instead of always favoring the same person.
- Just as explainable to players: *"teams are chosen to minimize rating difference."*

### 3.2 Match payout: expected score

Replace the flat/min-clamped delta with the classical Elo expected-score formula, applied at team level:

```
E        = 1 / (1 + 10^(−(ownTeamAvg − oppTeamAvg) / 30))
winner pool per player = K × (1 − E),  K = 20
loser pool per player  = −K × (1 − E)
draw: K × (E − 0.5) transfers from the higher-rated team to the lower
```

- Evenly matched teams trade ~10 points per player; a heavy favorite earns ~0 for winning and pays heavily for losing.
- Because the payout curve *is* the win-probability curve mirrored, being favored has **zero expected value at every rating gap**. There is no gap size at which wins are both near-certain and still profitable — the structural farming that drives today's runaway becomes mathematically impossible.
- The scale (30) is calibrated so the predicted win probability matches the actually observed win rate at each gap.

### 3.3 Performance credit: goal-credit production vs. rating-relative expectation

Each player's contribution to the match is measured in **credit**:

```
credit = 1.1 × goals + 0.9 × assists + 2.5 × saves
```

- **The scorer keeps full credit for every goal.** An assist is a *bonus on top* — an assisted goal generates more total credit (2.0) than a solo goal (1.1), so team play is rewarded, never penalized.
- **Saves are an independent defensive currency**, weighted high (2.5) because save opportunities are rarer than scoring chances — this weight is what lets defensive impact register in ratings at all (see 4.4).

Each player's share of their team's credit is compared to the share their **rating predicts** (a logistic curve over their ELO vs. the team average, scale 240):

- **75% of every team pool is guaranteed**, split evenly — this is the contract: *winners always gain, losers always lose.*
- The remaining 25% is performance-routed: on the winning team it goes to players who **beat** their rating's expectation; on the losing team, the extra losses fall on players who **missed** theirs.

Consequences:

- An overrated player bleeds rating even while winning half their games; an underrated player climbs even while losing half. Ratings mean-revert to demonstrated skill — this is what makes the ladder *converge* even when matchmaking keeps every match a coin flip.
- A player who plays a heroic defensive game in a loss still loses ELO — but the minimum, not the maximum. Effort is protected; outcomes still rule.
- Rating expectations scale with the curve, so this is also the **spread dial**: on the current ladder, scale 240 produces a top-to-bottom (top 10% vs. bottom 10%) gap of roughly **330 ELO** — wide enough for meaningful tiers, and adjustable.

### 3.4 Rating floor (new)

The current system has **no floor** — a long cold streak can drive a player's rating arbitrarily low. We introduce one: ELO cannot drop below **750**. A floor is normally the one thing that *can* inflate a rating economy — it truncates losses, so the matching gains elsewhere go unbalanced — so we verified ours does not: in simulation the floor is almost never touched (the converged ladder's bottom sits near 810, and on average ~0 players reach the floor in a season). It functions as a safety net for the bottom, not an inflation pump.

---

## 4. Evidence

All results below are averages over 30 independent simulated seasons per configuration, 2,000 matches per season (~350 matches per rated player), on the current fully-enriched match data.

### 4.1 The headline property: path independence

The proposed system converges to **the same ladder regardless of starting point**:

| Starting point | Final ladder σ | Player ordering |
|---|---|---|
| Current official ratings | 97 | same shape |
| Fresh reset (everyone 1000) | 88 | same shape |
| Fresh reset, *snake matchmaking kept* | 97 | same shape |

Per-player final ratings from the current-ratings start and the fresh-reset start agree at **correlation 0.85** — the ladder's shape is set by how players perform, not by where they began or which seat the matchmaker gave them. This is the defining property of a sound rating system, and the current formula fails it (section 2.2).

### 4.2 Convergence instead of runaway

- Current system (prior analysis): ladder spread grows without bound and *accelerates* (σ 83 → 604 over a season).
- Proposed system: from a fresh reset, spread rises from 0 and **flattens** into equilibrium around σ ≈ 88 within ~750–1,000 matches; started from current ratings it holds steady (σ ≈ 93 → 97, variance ratio ≈ 1.0). It reaches a stable level and stays there — no unbounded growth, and no free-falling bottom.

### 4.3 Fairness and economy

| Metric | Current (snake + live formula) | Proposed (optimal + expected score) |
|---|---|---|
| Higher-rated side win rate | 54.6% (measured) | 46.3 / 46.5 (no side) |
| Simulated win rate, favored vs. other | ~49 / 46 under snake | 46 / 46 (coin flip) |
| Median team rating gap | ~11–12 | **~1–2** |
| Highest rating after a season | ~5,300 (prior analysis) | **~1,300 (earned, no runaway)** |
| Downside protection | none — losers free-fall, no floor | floor at 750, essentially untouched |

### 4.4 Stats actually drive rating — in chosen proportion

The clearest test is a direct before/after: for the same 45 rated players, how well do their real per-game stats correlate with their rating **today** (current official ELO) versus **under the proposed system** (tuned config, official start, optimal split)?

| Stat | Weight (credit) | Corr. with current official ELO | Corr. under proposed system |
|---|---|---|---|
| Goals | 1.1 | 0.65 | **0.83** |
| Assists | 0.9 (bonus on the goal) | 0.58 | **0.77** |
| Saves | 2.5 | **0.02** | **0.24** |

Two things stand out:

- **The current system already tracks scoring and playmaking, but only moderately** (0.65 / 0.58) — and it leaves a lot of rating movement to be explained by *something other than stats* (i.e. seat and outcome). The proposed system tightens both to 0.83 / 0.77: the same stats explain substantially more of where a player lands.
- **Defense is invisible under the current system.** Saves correlate with current ELO at essentially zero (**0.02**) — a great goalkeeper and a passenger are rated the same for it. The proposed system's high save weight lifts this to **0.24**: still the weakest signal (save events are genuinely sparse in the recorded data — only a minority of player-games record one), but it goes from *nothing* to a real, positive contribution.

In short: the proposed system doesn't invent accountability from scratch, it *sharpens* it — and it puts defensive play on the board for the first time.

### 4.5 If the matchmaking can't change

The rating system is robust standalone: with the **snake matchmaker kept**, ratings still converge to the same fair ladder (the seat subsidy gets priced to ~zero by the expected-score payout — the highest rating stays near ~1,250 rather than running away). The residual cost is match fairness, not rating integrity — the favored side still *wins* ~49% vs 46% and carries an ~11-ELO team gap. That is why we recommend both changes: the rating overhaul fixes what ratings mean; the matchmaking change fixes who wins.

---

## 5. Proposed parameters

| Parameter | Value | Meaning |
|---|---|---|
| K factor | 20 | Even teams trade ~10 ELO per player per match |
| Expected-score scale | 30 | Calibrated so predicted win probability matches observed |
| Guaranteed share | 75% | Portion of each team pool paid regardless of individual performance — preserves "winners gain, losers lose" |
| Goal credit | 1.1 | Per goal, to the scorer |
| Assist credit | 0.9 | Per assist, as a bonus (assisted goal = 2.0 total team credit) |
| Save credit | 2.5 | Per save — keeps defense visible despite sparse save data |
| Performance scale | 240 | Spread dial: yields ~330 ELO top-to-bottom tier gap on the current ladder |
| Rating floor | 750 | New safety net (current system has none); effectively untouched in equilibrium |
| Matchmaking | Optimal split | Best of all 35 splits, random tiebreak/sides |

## 6. Migration

1. **No reset required.** Seed the new system with current ratings. In simulation this *converges* — over roughly one season, every player drifts to the level their play demonstrates. Players whose current rating is inflated or deflated by seat effects migrate gradually rather than being zeroed.
2. The basic contract holds from match one: win = gain, loss = lose, every time.
3. (Optional) A placement multiplier (e.g. 2× deltas for a player's first 20 matches) accelerates new-player convergence without affecting the equilibrium.

## 7. Known properties and limitations

- **Smaller current sample.** This re-simulation runs on freshly-collected data: 45 rated players with 10+ matches across 260 recorded games. That is enough to establish the structural properties (path independence, fairness, convergence) but is a smaller base than a full historical pull; absolute numbers will firm up as more matches are collected.
- **Sparse save data limits the defensive signal.** Saves correlate with rating only moderately (0.20) here because recorded save events are rare. The credit weight (2.5) is set high precisely to compensate; if saves become better recorded, expect this correlation to rise.
- **Exceptional dominance keeps slow headroom.** A player who consistently produces beyond what *any* rating predicts continues to creep upward slowly rather than hard-capping. We consider this correct behavior; it is slow and visible in monitoring.
- **The simulation is a model, not a prophecy.** Outcome noise, stat generation, and lobby formation are simplified. Every comparison above holds the simulation environment constant between current and proposed systems.
- **Weights are tunable post-launch.** The credit weights and spread dial are policy choices, not load-bearing math; they can be adjusted from live data without touching the convergence or fairness properties.

---

*Methodology: Monte Carlo season simulator (`/simulateseason`, now also a standalone local app). Each experiment simulates 2,000 matches per season across 30 independent seasons, with lobby selection, team assignment, and stat generation seeded from each player's real per-game averages, rating updates, and full season telemetry (spread checkpoints, win/draw/upset rates, team balance, economy audits, per-stat correlation analysis). Re-simulated July 2026 on refreshed match data. Source and full run history available on request.*
