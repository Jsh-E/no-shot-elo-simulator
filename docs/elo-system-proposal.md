# A Healthier Rating System for No Shot

**A data-driven proposal for replacing the current ELO and matchmaking design**

*Prepared from Monte Carlo season simulations (30 simulated seasons per configuration, 2,000 matches per season) run against the recorded match history of the community ladder — 45 rated players with 10+ matches, drawn from 251 tracked accounts and 240 fully-reconstructed 4v4 matches. Re-simulated July 2026 on refreshed match data.*

---

## 1. Executive summary

The current ranked system has two structural problems that compound each other:

1. **The snake-draft matchmaker systematically favors the higher-rated seat.** Because picks 1, 4, 5, 8 always go to the same side, the team holding the top seat carries a real rating edge whenever the ladder has a gap at the top — and ours does. In simulation the snake leaves a **median team-rating gap of ~11–12 ELO** (optimal balancing brings this to ~1–2), and the higher-rated side wins measurably more often. Measured directly from recorded matches, **the higher-rated team wins 50% of all games to the lower-rated side's 42%** (the remaining ~8% are ties) — 54.6% counting decisive games only. Rating predicts outcome, so a matchmaker that hands the same player the rating edge hands them a standing advantage.
2. **The current rating formula cannot correct it.** A favored team still banks a guaranteed minimum for wins it was always going to get, so a permanently favored seat farms rating with no equilibrium — and because the current system **has no rating floor**, the players who keep losing sink without limit. The ladder pulls apart from both ends: a runaway top and a free-falling bottom. *(The unbounded-spread projection quantifying this — σ→604, a #1 seat past 5,000 ELO — comes from the earlier full-history analysis and is retained in §2.2; it models the current min-clamped formula, which the present simulator does not reproduce.)*

We propose a three-layer replacement — **optimal team balancing, expected-score match payouts, and rating-relative performance credit** — that in simulation:

- converges to the **same ladder from any starting point** (current ratings, a fresh reset, or even under the old snake matchmaking) — per-player final ratings agree across starting points at **correlation 0.85**,
- keeps blue/red win rates even at **~46 / 46** (the rest draws), with no structurally favored side,
- reaches a **stable, bounded ladder** — the spread converges instead of pulling apart without end — and adds a rating floor that protects the bottom without inflating the economy,
- makes stats matter *more*, and in chosen proportion — stat-to-rating correlation rises from **0.65 / 0.58 / 0.02** (goals / assists / saves under today's ratings) to **0.83 / 0.77 / 0.24**, turning defense from statistically invisible into a rated contribution,
- and **never breaks the basic contract**: winners always gain ELO, losers always lose ELO, no matter how well or badly an individual performed.

Migration is clean: because the system reaches the same ladder from any starting point (§4.1), we recommend a **full ELO reset** — everyone starts level and the fair ladder rebuilds itself within about a season (a season is 2,000 matches in these simulations). (Seeding from current ratings also works and converges to the same place, for communities that prefer continuity.)

---

## 2. The problem, measured

### 2.1 The snake draft has a built-in bias

The live matchmaker sorts the 8-player lobby by ELO and deals picks **1, 4, 5, 8** to Blue and **2, 3, 6, 7** to Red. This balances *rank sums* (1+4+5+8 = 2+3+6+7), but it only balances *ELO* if ratings are evenly spaced. The moment the ladder has a gap at the top — and ours does — the team holding pick #1 inherits that entire gap.

Measured from recorded match history (238 fully-reconstructed 4v4 matches — 218 decisive, 20 ties):

| Metric | Value |
|---|---|
| Higher-rated team: win / loss / tie | **50.0% / 41.6% / 8.4%** |
| — counting decisive games only, higher-rated wins | **54.6%** |
| Simulated median team-rating gap under the snake | **~11–12 ELO** |
| Simulated median team-rating gap under optimal balancing | **~1–2 ELO** |

The higher-rated team wins half of all matches to the lower-rated side's 42% (the rest are ties) — a real, standing edge, not noise that averages out. Because the same player occupies the top seat in most lobbies, that edge is handed to whoever is ranked #1, sitting on top of the gap that creates it.

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

With 8 players there are only **35 ways to divide them into two teams of four** (C(8,4) ÷ 2). Enumerate all 35, pick the division with the smallest average-ELO difference, and break ties randomly. That fixes the two teams; a coin flip then assigns which takes the Blue vs. Red side, so no group inherits a physical side advantage.

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

where:

- **E** — your team's *expected result*, a win probability from 0 to 1, read off the rating gap between the teams;
- **ownTeamAvg**, **oppTeamAvg** — the average ELO of your team and of the opposing team;
- **K** (= 20) — the *K factor*, the most a single player's rating can move in one match;
- **30** — the *expected-score scale*, which sets how a rating gap converts into a win probability (see §5).

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

The current system has **no floor** — a long cold streak can drive a player's rating arbitrarily low, stranding them so far below the population that they can neither find balanced lobbies nor climb back. We introduce one: ELO cannot drop below **750**.

A rating floor is standard practice in competitive games, and its real purpose is **player retention and matchmaking quality**, not economics: it keeps struggling players tethered to the pack and within reach of reasonable matches, rather than letting them drown in isolation far from everyone else. In our simulations the floor is almost never touched (the converged ladder's bottom sits near 810, and on average ~0 players reach it across a full season of 2,000 matches) — so it costs nothing at equilibrium; it is simply there for the cold streak that needs it. And because the payouts above it are zero-sum, the floor never becomes an inflation pump the way an unbalanced floor can.

---

## 4. Evidence

All results below are averages over 30 independent simulated seasons per configuration, 2,000 matches per season (~350 matches per rated player), on the current fully-enriched match data.

### 4.1 The headline property: path independence

*Path independence* asks one specific question: run the **proposed** system from different starting ratings, and does it arrive at the same ladder? It does — the starting point washes out.

| Proposed system, started from… | Final ladder σ | Final ordering |
|---|---|---|
| Current official ratings | 97 | agrees with the others |
| Fresh reset (everyone 1000) | 88 | agrees with the others |
| Fresh reset, *snake matchmaking kept* | 97 | agrees with the others |

Run the new system from today's ratings, then run it again from a blank slate, and the two final ladders come out in the same order — per-player final ratings agree at **correlation 0.85** (the absolute spread σ wobbles between 88 and 97, but the *ranking* is stable). Where a player ends up is decided by how they play, not by where they started or which seat the matchmaker handed them.

**This does not mean players keep their current rank.** That is a separate comparison. Measured against *today's* official ratings, the proposed ladder correlates only about **0.71** — clearly related, but far from identical: plenty of players move, some substantially. That movement is exactly the intended correction — the new system unwinding seat-driven inflation and re-rating people on demonstrated performance. Path independence is the stronger, separate point that this *corrected* ladder is the same destination no matter where you begin — which is why a clean reset (§6) arrives at the same place as a gradual migration from current ratings, only faster. The current system fails this test outright (section 2.2): where you land depends heavily on the seat you were handed.

### 4.2 Convergence instead of runaway

- Current system (prior analysis): ladder spread grows without bound and *accelerates* (σ 83 → 604 over a projected season of 4,000–5,000 matches).
- Proposed system: from a fresh reset, spread rises from 0 and **flattens** into equilibrium around σ ≈ 88 within ~750–1,000 matches (under half of a 2,000-match season); started from current ratings it holds steady (σ ≈ 93 → 97, variance ratio ≈ 1.0). It reaches a stable level and stays there — no unbounded growth, and no free-falling bottom.

### 4.3 Fairness and economy

| Metric | Current (snake + live formula) | Proposed (optimal + expected score) |
|---|---|---|
| Higher-rated team, real matches (win / loss / tie) | 50.0% / 41.6% / 8.4% (measured) | — teams balanced by design |
| Simulated result (blue / red / tie) | ~48% / ~46% / ~6% (snake; blue = favored seat) | ~46% / ~46% / ~7% (coin flip) |
| Median team rating gap | ~11–12 | **~1–2** |
| Highest rating after a season (2,000 matches) | ~5,300 (prior analysis) | **~1,300 (earned, no runaway)** |
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

---

## 5. Proposed parameters

| Parameter | Value | Meaning |
|---|---|---|
| K factor | 20 | Even teams trade ~10 ELO per player per match |
| Expected-score scale | 30 | How steeply a rating gap converts into a win probability. A smaller number makes gaps matter more (a small edge implies a big favorite); larger flattens it. Tuned to 30 so the predicted win rate matches the win rate actually observed at each gap. |
| Guaranteed share | 75% | Portion of each team pool paid regardless of individual performance — preserves "winners gain, losers lose" |
| Goal credit | 1.1 | Per goal, to the scorer |
| Assist credit | 0.9 | Per assist, as a bonus (assisted goal = 2.0 total team credit) |
| Save credit | 2.5 | Per save — keeps defense visible despite sparse save data |
| Performance scale | 240 | The spread dial: sets how far the ladder stretches (currently ~330 ELO from top 10% to bottom 10%). Meant to be **re-tuned as the game grows** — a larger, more varied player base supports a wider ladder. |
| Rating floor | 750 | New safety net (current system has none); effectively untouched in equilibrium |
| Matchmaking | Optimal split | Best of all 35 splits, random tiebreak/sides |

The two *scales* are the main tuning knobs and do different jobs. The **expected-score scale (30)** shapes match payouts — how confidently a rating gap predicts the winner. The **performance scale (240)** shapes the ladder itself — how far ratings spread top to bottom. Neither is load-bearing for the fairness or convergence properties, so both can be adjusted from live data; expect to revisit the performance scale periodically as the community grows.

## 6. Migration

**Recommended: a clean ELO reset.** Because the proposed system provably converges to the same ladder regardless of starting point (§4.1 — per-player agreement of **0.85** between a current-ratings start and a fresh reset), a reset costs nothing in final accuracy while gaining everything in legitimacy. Every player starts level; no one carries a seat-inflated or seat-deflated rating into the new system; and the ladder that emerges is visibly *earned* from match one under the new rules. In simulation a fresh reset settles into the fair ladder within ~750–1,000 matches (under half of a 2,000-match season).

1. **Reset all ratings to the baseline (1000).** Optionally apply a placement multiplier (e.g. 2× deltas for a player's first 20 matches) so players reach their level faster; this does not change the equilibrium.
2. The basic contract holds from match one: win = gain, loss = lose, every time.
3. **Alternative (no reset):** seed the new system with current ratings instead. It converges to the same ladder over roughly a season (2,000 matches), migrating seat distortions out gradually rather than at once — a gentler transition for communities that prefer continuity over a clean slate.

## 7. Known properties and limitations

- **Smaller current sample.** This re-simulation runs on freshly-collected data: 45 rated players with 10+ matches across 260 recorded games. That is enough to establish the structural properties (path independence, fairness, convergence) but is a smaller base than a full historical pull; absolute numbers will firm up as more matches are collected.
- **Sparse save data limits the defensive signal.** Saves correlate with rating only moderately (0.24) here because recorded save events are rare. The credit weight (2.5) is set high precisely to compensate; if saves become better recorded, expect this correlation to rise.
- **Exceptional dominance keeps slow headroom.** A player who consistently produces beyond what *any* rating predicts continues to creep upward slowly rather than hard-capping. We consider this correct behavior; it is slow and visible in monitoring.
- **The simulation is a model, not a prophecy.** Outcome noise, stat generation, and lobby formation are simplified. Every comparison above holds the simulation environment constant between current and proposed systems.
- **Weights are tunable post-launch.** The credit weights and spread dial are policy choices, not load-bearing math; they can be adjusted from live data without touching the convergence or fairness properties.

---

## 8. Run the simulator yourself

Every figure in this document is reproducible. The simulator is open source and runs entirely on your own machine — the only network call is the optional data refresh, which pulls the public game ladder.

**Repository:** https://github.com/Jsh-E/no-shot-elo-simulator

**Requirements:** [Node.js](https://nodejs.org) 18+ and (for the graphs) Python 3.9+ with `matplotlib` and `numpy` (`pip install matplotlib numpy`).

**Get it running:**

```
git clone https://github.com/Jsh-E/no-shot-elo-simulator.git
cd no-shot-elo-simulator
npm install
npm start
```

Then open **http://localhost:4173** in your browser. The database ships empty — click **Refresh match history** once to collect the current ladder and match stats from the public API (rate-limited, so a first full pull takes a few minutes). When the "4v4 rosters" counter turns green you can simulate.

**Reproduce the comparison in this document:** in the parameter panel, use the proposed tuned config — K factor 20, expected scale 30, guaranteed 75%, goal 1.1, assist 0.9, save 2.5, performance scale 240, ELO floor 750 — and switch **Team assignment** between **Optimal** (proposed) and **Snake** (current), and **Starting mode** between **Official** and **Fresh**, to see path independence, fairness, and convergence for yourself. The exact experiment battery and the correlation analysis behind §4.4 are scripted in `scripts/proposal_numbers.ts` and `scripts/stat_correlations.ts` (`npx tsx scripts/proposal_numbers.ts`).

Anyone can run their own numbers, on their own data, and check every claim here independently.

---

*Methodology: Monte Carlo season simulator (`/simulateseason`, now also a standalone local app). Each experiment simulates 2,000 matches per season across 30 independent seasons, with lobby selection, team assignment, and stat generation seeded from each player's real per-game averages, rating updates, and full season telemetry (spread checkpoints, win/draw/upset rates, team balance, economy audits, per-stat correlation analysis). Re-simulated July 2026 on refreshed match data. Source and full run history available on request.*
