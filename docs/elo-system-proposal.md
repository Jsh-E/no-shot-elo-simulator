# A Healthier Rating System for No Shot

**A data-driven proposal for replacing the current ELO and matchmaking design**

*Prepared from Monte Carlo season simulations (30 simulated seasons per configuration, 2,000 matches per season) run against the recorded match history of the community ladder — 45 rated players with 10+ matches, drawn from 251 tracked accounts and 240 fully-reconstructed 4v4 matches. Re-simulated July 2026 on refreshed match data.*

---

## 1. Executive summary

The current ranked system has two structural problems that compound each other:

1. **The snake-draft matchmaker systematically favors the higher-rated seat.** Because picks 1, 4, 5, 8 always go to the same side, the team holding the top seat carries a real rating edge whenever the ladder has a gap at the top — and it does. In simulation the snake leaves a **median team-rating gap of ~11–12 ELO** (optimal balancing brings this to ~1–2), and the higher-rated side wins measurably more often. Measured directly from recorded matches, **the higher-rated team wins 50% of all games to the lower-rated side's 42%** (the remaining ~8% are ties) — 54.6% counting decisive games only. Rating predicts outcome, so a matchmaker that hands the same player the rating edge hands them a standing advantage.
2. **The current rating formula cannot correct it.** Live deltas are clamped into a narrow **9–11** band, which strips out the feedback that makes Elo self-correcting: a win pays about 10 whether you were a coin flip or a near-certainty, so nothing shrinks as you climb. Anyone sustaining a win rate above **55%** gains rating every match with no equilibrium — and because the current system **has no rating floor**, the players they drain sink without limit. Simulated on current data, the ladder pulls apart from both ends: **σ 93 → 603 and still accelerating** after one 2,000-match season, top rating ~3,400, bottom below zero and still falling. Replacing the payout alone brings σ to 110 and flat; better matchmaking alone only halves the runaway.

I propose a three-layer replacement — **optimal team balancing, expected-score match payouts, and rating-relative performance credit** — that in simulation:

- **recovers real skill.** In simulation each player carries a fixed latent skill that drives match outcomes but is never itself a rating input; the proposed ladder tracks it at **correlation 0.91** (0.98 from a fresh reset), against just **0.52** for today's ratings — the current ladder tracks the seat-inflated ordering it inherited, not skill,
- converges to the **same ladder from any starting point** (current ratings, a fresh reset, or even under the old snake matchmaking) — per-player final ratings agree across starting points at **correlation 0.93**,
- keeps blue/red win rates even at **~46 / 46** (the rest draws), with no structurally favored side,
- reaches a **stable, bounded ladder** — the spread converges instead of pulling apart without end — and adds a rating floor that protects the bottom without inflating the economy,
- makes stats matter *more*, and in chosen proportion — stat-to-rating correlation rises from **0.66 / 0.57 / 0.02** (goals / assists / saves under today's ratings) to **0.80 / 0.77 / 0.34**, turning defense from statistically invisible into a rated contribution,
- and **never breaks the basic contract**: winners always gain ELO, losers always lose ELO, no matter how well or badly an individual performed.

Migration is clean: because the system reaches the same ladder from any starting point (§4.1), I recommend a **full ELO reset** — everyone starts level and the fair ladder rebuilds itself within about a season (a season is 2,000 matches in these simulations). (Seeding from current ratings also works and converges to the same place, for communities that prefer continuity.)

---

## 2. The problem, measured

### 2.1 The snake draft has a built-in bias

The live matchmaker sorts the 8-player lobby by ELO and deals picks **1, 4, 5, 8** to Blue and **2, 3, 6, 7** to Red. This balances *rank sums* (1+4+5+8 = 2+3+6+7), but it only balances *ELO* if ratings are evenly spaced. The moment the ladder has a gap at the top — and it does — the team holding pick #1 inherits that entire gap.

Measured from recorded match history (238 fully-reconstructed 4v4 matches — 218 decisive, 20 ties):

| Metric | Value |
|---|---|
| Simulated median team-rating gap under the snake | **~11–12 ELO** |
| Simulated median team-rating gap under optimal balancing | **~1–2 ELO** |
| Higher-rated team: win / loss / tie (measured) | 50.0% / 41.6% / 8.4% |
| — counting decisive games only, higher-rated wins | 54.6% (n=218, 95% CI 48–61%) |

The argument is the first two rows plus one structural fact, and it does not depend on the third.

**The snake leaves a gap that optimal balancing removes** — a median ~11–12 ELO against ~1–2. **And the snake always hands that gap to the same person.** Pick #1 is by definition the highest-rated player in the lobby, so whoever sits at the top of the ladder inherits the advantage in every lobby they enter. Balancing errors under an optimal split land on random sides and cancel out per player; under the snake they accumulate on one.

That is the whole problem: not that the matchmaker is imprecise, but that its imprecision is *aimed*, and always at the same target.

**On the measured win rates.** A higher-rated team winning more is what a functioning rating system looks like — on its own it is not evidence of bias, and we do not offer it as such. What it establishes is the premise the argument needs: rating genuinely predicts outcome here, so a standing rating edge is a standing competitive edge rather than a cosmetic one. Note the sample is thin — 54.6% over 218 decisive games carries a 95% confidence interval of roughly 48–61%, which only barely excludes a coin flip. Treat it as corroboration of the premise, not as a load-bearing measurement.

### 2.2 The rating formula amplifies it

The live formula's per-player deltas, read off recorded matches, sit in a narrow **9–11** band. That band is the entire problem, and it is worth being precise about why.

A working Elo has a negative feedback loop: as you climb, your expected score rises, so wins pay you less and losses cost you more, until you settle at the rating your win rate justifies. **Clamping the payout into a 2-point band removes that loop.** A win pays about 10 whether you were a coin flip or a 95% favorite. Nothing shrinks as you climb, so nothing stops you climbing.

The break-even is exact and it is low. Winning pays at least `min`, losing costs at most `max`, so a player profits whenever their win rate exceeds `max / (min + max)` — for a 9–11 band, **any sustained win rate above 55%**. Every such player gains rating every match, forever, drained off the players below them, who with **no rating floor** sink without limit.

Simulated on current data — snake matchmaking, the 9–11 clamped payout, no floor, 10 seasons of 2,000 matches:

| Metric | Current system | Proposed |
|---|---|---|
| Ladder std. deviation | 93 → **603**, still accelerating | 93 → **97**, flat |
| Highest player rating | **~3,400** and climbing | ~1,304 |
| Lowest player rating | **below zero**, still falling | ~817 |
| Variance ratio (final ÷ starting σ) | **6.46** | **1.04** |

The spread is not converging anywhere: σ runs 131 → 173 → 235 → 310 → 455 → **603** across the season, gaining faster at the end than at the start. Extrapolated to the 4,000–5,000-match horizon of the earlier full-history analysis, this comfortably exceeds that study's projection of σ ≈ 604 and a top seat past 5,000 — so the earlier figure, long cited as the alarming one, now looks conservative.

The bottom is worth sitting with. With no floor, ratings at the bottom fall **through zero and keep going** — the average worst rating each season lands negative, and individual seasons drive a player well past −400: not merely last, but off the scale entirely, unmatchable, and still descending. "Free-falls without bound" is not rhetoric — the simulation has to be run with the floor disabled entirely to reproduce it, because any floor at all, even one at zero, quietly absorbs the fall and understates the damage.

**Which layer causes it.** Holding everything else fixed and changing one thing at a time:

| Configuration | Final σ | Blue / red / tie | Skill recovery | Verdict |
|---|---|---|---|---|
| Current: snake + 9–11 clamp | **603** | 57.2 / 39.8 / 3.0 | **0.57** | runaway, side-biased, skill-blind |
| Snake kept, expected-score payout | **110** | 48.2 / 45.8 / 6.0 | 0.95 | converges, still side-biased |
| 9–11 clamp kept, optimal split | **215** | 46.0 / 45.8 / 8.2 | 0.98 | tracks skill, still runaway |
| Proposed: optimal + expected score | **97** | 45.7 / 45.8 / 8.5 | 0.91 | converges, no bias, tracks skill |

This separates the failures cleanly, and each layer fixes its own:

- **The matchmaker causes the side bias.** Under the snake, blue takes 57.2% to red's 39.8%. Switching to an optimal split levels it to 46.0 / 45.8 — *while leaving the broken payout in place*. The bias is a draft problem.
- **The payout causes the runaway.** Optimal balancing alone still ends at σ 215 and climbing; only replacing the payout converges. Better matchmaking roughly halves the rate of divergence but cannot stop it, because a clamped payout keeps overpaying a favorite no matter how well matched the teams are. The runaway is a formula problem.

Neither layer substitutes for the other, and only the proposed system holds all three properties — bounded spread, even sides, *and* a ladder that tracks skill (§4.4). That is why the proposal changes both layers.

Widening the band restores the feedback monotonically — σ falls **656** (a flat 10) → **603** (9–11) → **454** (7–13) → **322** (5–15) → **177** (unclamped) — which is the same statement from the other direction. The runaway is precisely the missing rating sensitivity, and it scales with how much of it has been clamped away.

*Reconstruction note: the simulator's `legacy` payout mode is rebuilt from the 9–11 deltas observed in recorded matches, not from the live bot source. It is deliberately flat — every winner gains the same delta and every loser pays it back, with no per-player performance weighting — matching the live system's behaviour. Reproduce with `npx tsx scripts/proposal_numbers.ts` (experiments L1–L4).*

**Validation note:** the earlier full-history simulator was not tuned to produce this — fed only the current ratings and the snake rule, it independently reproduced the measured Blue bias of the day. The present re-simulation reproduces its runaway from an independently-derived formula on freshly-collected data, and confirms the mechanism's premise directly: rating genuinely predicts outcome (higher-rated team wins 54.6% of decisive games), so a seat-based rating edge is a real competitive edge.

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

Every match moves one **pool**, of the same size, from one team to the other — so a match is always zero-sum:

```
E_team = 1 / (1 + 10^(−(thisTeamAvg − otherTeamAvg) / 30))

Decisive match, per player:
    pool = K × (1 − E_winner)          (equivalently: K × E_loser)
    winner  +pool          loser  −pool

Draw, per player:
    pool = K × (E_higher − 0.5)
    lower-rated team  +pool            higher-rated team  −pool
```

where:

- **E_team** — that team's *expected result*, a win probability from 0 to 1, read off the rating gap between the two teams;
- **E_winner**, **E_loser**, **E_higher** — that same quantity evaluated for, respectively, the team that won, the team that lost, and (on a draw) the higher-rated team;
- **thisTeamAvg**, **otherTeamAvg** — the average ELO of the two teams;
- **K** (= 20) — the *K factor*, the most a single player's rating can move in one match;
- **30** — the *expected-score scale*, which sets how a rating gap converts into a win probability (see §5).

Note the pool is always computed from the **winner's** expected score, whichever side that turns out to be. That single rule is what makes the next property hold.

- Evenly matched teams trade ~10 points per player; a heavy favorite earns ~0 for winning and pays heavily for losing.
- Because the payout curve *is* the win-probability curve mirrored, being favored has **zero expected value at every rating gap**. There is no gap size at which wins are both near-certain and still profitable — the structural farming that drives today's runaway becomes mathematically impossible.

  *Proof, in one line:* a team with expected score **E** wins with probability **E** and gains **K(1 − E)**; it loses with probability **(1 − E)** and pays **K·E**. Expected change: **E·K(1 − E) − (1 − E)·K·E = 0**, for every value of E.
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

The current system has **no floor** — a long cold streak can drive a player's rating arbitrarily low, stranding them so far below the population that they can neither find balanced lobbies nor climb back. I introduce one: ELO cannot drop below **750**.

A rating floor is standard practice in competitive games, and its real purpose is **player retention and matchmaking quality**, not economics: it keeps struggling players tethered to the pack and within reach of reasonable matches, rather than letting them drown in isolation far from everyone else.

Be precise about the cost, because a floor is not free in principle. **Every other payout in this system is zero-sum — the floor is the one exception.** When a player at the floor cannot pay their full share of a loss, the winners still collect theirs in full, and the difference is rating created from nothing. A floor is an inflation source by construction; the only question is how much it actually mints.

So the simulator measures it directly rather than assuming it away. Across a full 2,000-match season the converged ladder's bottom settles near **817**, **no player ends the season at the floor**, and the total rating the floor creates is **~13 ELO**. Against a ladder carrying roughly 45,000 rating points in total, that is **0.03% per season** — the floor fires on the occasional cold streak, catches it, and contributes nothing at equilibrium.

That is the honest claim, and it is checkable rather than assumed: the figure is reported as `avgFloorAbsorbed` on every run. If the community ever grows in a way that parks players at 750, this is the number that will show it first. It is instrumented for exactly that reason.

---

## 4. Evidence

All results below are averages over 30 independent simulated seasons per configuration, 2,000 matches per season (~350 matches per rated player), on the current fully-enriched match data.

### 4.1 The headline property: path independence

*Path independence* asks one specific question: run the **proposed** system from different starting ratings, and does it arrive at the same ladder? It does — the starting point washes out.

| Proposed system, started from… | Final ladder σ | Final ordering |
|---|---|---|
| Current official ratings | 97 | agrees with the others |
| Fresh reset (everyone 1000) | 88 | agrees with the others |
| Fresh reset, *snake matchmaking kept* | 102 | agrees with the others |

Run the new system from today's ratings, then run it again from a blank slate, and the two final ladders come out in the same order — per-player final ratings agree at **correlation 0.93** (the absolute spread σ wobbles between 88 and 102, but the *ranking* is stable). Where a player ends up is decided by how they play, not by where they started or which seat the matchmaker handed them.

**This does not mean players keep their current rank.** That is a separate comparison. Measured against *today's* official ratings, the proposed ladder correlates only about **0.67** — clearly related, but far from identical: plenty of players move, some substantially. That movement is exactly the intended correction — the new system unwinding seat-driven inflation and re-rating people on demonstrated performance. Path independence is the stronger, separate point that this *corrected* ladder is the same destination no matter where you begin — which is why a clean reset (§6) arrives at the same place as a gradual migration from current ratings, only faster. The current system fails this test outright (section 2.2): where you land depends heavily on the seat you were handed.

### 4.2 Convergence instead of runaway

- Current system: ladder spread grows without bound and *accelerates* — σ 93 → 603 over a 2,000-match season, gaining faster at the end than at the start (§2.2).
- Proposed system: from a fresh reset, spread rises from 0 and **flattens** into equilibrium around σ ≈ 88 within ~750–1,000 matches (under half of a 2,000-match season); started from current ratings it holds steady (σ ≈ 93 → 97, variance ratio ≈ 1.0). It reaches a stable level and stays there — no unbounded growth, and no free-falling bottom.

### 4.3 Fairness and economy

| Metric | Current (snake + live formula) | Proposed (optimal + expected score) |
|---|---|---|
| Higher-rated team, real matches (win / loss / tie) | 50.0% / 41.6% / 8.4% (measured) | — teams balanced by design |
| Simulated result (blue / red / tie) | 57.2% / 39.8% / 3.0% (snake; blue = favored seat) | **45.7% / 45.8% / 8.5%** (even) |
| Median team rating gap | ~11–12 | **~1–2** |
| Highest rating after a season (2,000 matches) | ~3,400 and still climbing | **~1,304 (earned, no runaway)** |
| Lowest rating after a season | below zero, still falling | **817** |
| Ladder σ after a season | 603, accelerating | **97, flat** |
| Skill recovery (final rating vs latent skill) | **0.57** | **0.91** |
| Downside protection | none — losers free-fall past zero | floor at 750, ~13 ELO absorbed per season |

### 4.4 Stats actually drive rating — in chosen proportion

The clearest test is a direct before/after: for the same 45 rated players, how well do their real per-game stats correlate with their rating **today** (current official ELO) versus **under the proposed system** (tuned config, official start, optimal split)?

| Stat | Weight (credit) | Corr. with current official ELO | Corr. under proposed system |
|---|---|---|---|
| Goals | 1.1 | 0.66 | **0.80** |
| Assists | 0.9 (bonus on the goal) | 0.57 | **0.77** |
| Saves | 2.5 | **0.02** | **0.34** |

Two things stand out:

- **The current system already tracks scoring and playmaking, but only moderately** (0.66 / 0.57) — and it leaves a lot of rating movement to be explained by *something other than stats* (i.e. seat and outcome). The proposed system tightens both to 0.80 / 0.77: the same stats explain substantially more of where a player lands.
- **Defense is invisible under the current system.** Saves correlate with current ELO at essentially zero (**0.02**) — a great goalkeeper and a passenger are rated the same for it. That is not a tuning oversight but a structural one: the live formula pays every player on a team the same delta, so there is no per-player channel through which a save could ever affect a rating. The proposed system's high save weight lifts this to **0.34**: still the weakest of the three (save events are genuinely sparse — about 0.19 per player-game), but it goes from *nothing* to a real, positive contribution.

In short: the proposed system doesn't invent accountability from scratch, it *sharpens* it — and it puts defensive play on the board for the first time.

*A note on what this measures.* In the simulator each player has a hidden **true skill** that decides match outcomes but is never fed back into their rating. Their per-game stats are a noisy readout of that skill; their rating is built only from wins, losses, and credit. So the correlations above are not the model grading its own homework — the thing that decides games and the thing that sets ratings are deliberately separated. §4.5 measures the separation head-on.

### 4.5 The ladder recovers real skill

This is the sharpest single test of a rating system, and it is only askable because outcomes are driven by a latent skill the rating never sees: **after a season, how well does the final ladder line up with that hidden skill?**

| System | Final rating vs. true skill |
|---|---|
| Today's official ratings | **0.52** |
| Current system, simulated forward (snake + clamp) | 0.57 |
| Proposed, started from current ratings | **0.91** |
| Proposed, started from a fresh reset | **0.98** |

Today's ladder barely tracks skill (**0.52**) — and running the current system forward does not fix it (0.57), because the snake keeps concentrating skill on one seat and the clamped payout keeps rewarding the seat rather than the skill. Notably, the current ladder correlates with the *old official ordering* at ~0.90 while tracking actual skill at ~0.5: it is faithfully reproducing seat inflation, not measuring players.

The proposed system recovers skill at **0.91**, and **0.98** from a clean reset. Fixing either layer alone already lifts recovery above 0.9 (optimal-split-with-clamp reaches 0.98) — but those configurations fail *other* tests: the clamp still runs the spread away (§2.2), and the snake still owns a seat (§4.3). Only the full proposal recovers skill **and** stays bounded **and** keeps sides even. That combination is the whole argument in one line.

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
| Performance scale | 240 | The spread dial: sets how far the ladder stretches (currently ~340 ELO from top 10% to bottom 10%). Meant to be **re-tuned as the game grows** — a larger, more varied player base supports a wider ladder. |
| Rating floor | 750 | New safety net (current system has none); effectively untouched in equilibrium |
| Matchmaking | Optimal split | Best of all 35 splits, random tiebreak/sides |

The two *scales* are the main tuning knobs and do different jobs. The **expected-score scale (30)** shapes match payouts — how confidently a rating gap predicts the winner. The **performance scale (240)** shapes the ladder itself — how far ratings spread top to bottom. Neither is load-bearing for the fairness or convergence properties, so both can be adjusted from live data; expect to revisit the performance scale periodically as the community grows.

## 6. Migration

**Recommended: a clean ELO reset.** Because the proposed system provably converges to the same ladder regardless of starting point (§4.1 — per-player agreement of **0.93** between a current-ratings start and a fresh reset), a reset costs nothing in final accuracy while gaining everything in legitimacy. Every player starts level; no one carries a seat-inflated or seat-deflated rating into the new system; and the ladder that emerges is visibly *earned* from match one under the new rules. In simulation a fresh reset settles into the fair ladder within ~750–1,000 matches (under half of a 2,000-match season).

1. **Reset all ratings to the baseline (1000).** Optionally apply a placement multiplier (e.g. 2× deltas for a player's first 20 matches) so players reach their level faster; this does not change the equilibrium.
2. The basic contract holds from match one: win = gain, loss = lose, every time.
3. **Alternative (no reset):** seed the new system with current ratings instead. It converges to the same ladder over roughly a season (2,000 matches), migrating seat distortions out gradually rather than at once — a gentler transition for communities that prefer continuity over a clean slate.

## 7. Known properties and limitations

- **Smaller current sample.** This re-simulation runs on freshly-collected data: 45 rated players with 10+ matches across 260 recorded games. That is enough to establish the structural properties (path independence, fairness, convergence) but is a smaller base than a full historical pull; absolute numbers will firm up as more matches are collected.
- **Sparse save data limits the defensive signal.** Saves correlate with rating only moderately (0.34) here because recorded save events are rare — roughly 0.19 per player-game in decisive matches. The credit weight (2.5) is set high precisely to compensate; if saves become better recorded, expect this correlation to rise.
- **Exceptional dominance keeps slow headroom.** A player who consistently produces beyond what *any* rating predicts continues to creep upward slowly rather than hard-capping. I consider this correct behavior; it is slow and visible in monitoring.
- **The simulation is a model, not a prophecy.** Outcome noise, stat generation, and lobby formation are simplified. Every comparison above holds the simulation environment constant between current and proposed systems.
- **How outcomes are generated (and why the skill-recovery test is fair).** Each player is assigned a fixed *true skill* — their expected per-game credit from real history — and match results are drawn from the two teams' true-skill totals plus noise. This latent skill drives who wins but is **never** an input to any rating. A player's per-game stats are generated as a noisy readout of it. This is what makes §4.4 and §4.5 honest: the quantity that decides games and the quantity the rating is built from are deliberately separate, so a high correlation between final rating and skill reflects genuine recovery rather than a variable predicting itself.
- **The current system's payout is reconstructed, not read from source.** Section 2.2 models it as the expected-score pool clamped into the 9–11 band observed in recorded matches, with no per-player performance routing. The runaway it produces is not sensitive to getting that band exactly right — every band from a flat 10 up to 5–15 runs away, and only removing the clamp entirely stops it — but the specific figures would shift if the live formula differs in shape.
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

**Reproduce the comparison in this document:** in the parameter panel, use the proposed tuned config — K factor 20, expected scale 30, guaranteed 75%, goal 1.1, assist 0.9, save 2.5, performance scale 240, ELO floor 750 — and switch **Team assignment** between **Optimal** (proposed) and **Snake** (current), and **Starting mode** between **Official** and **Fresh**, to see path independence, fairness, and convergence for yourself.

To reproduce §2.2's runaway, set **Payout mode** to **Min-clamped (current system)** with the delta band at **9–11**, guaranteed at **100%**, team assignment **Snake**, and ELO floor **0**.

Set the **Seed** field to any value to make a run reproduce exactly; leave it blank for a fresh random run each time. The exact experiment battery and the correlation analysis behind §4.4 are scripted in `scripts/proposal_numbers.ts` and `scripts/stat_correlations.ts` (`npx tsx scripts/proposal_numbers.ts`), both seeded by default.

Anyone can run their own numbers, on their own data, and check every claim here independently.

---

*Methodology: Monte Carlo season simulator (`/simulateseason`, now also a standalone local app). Each experiment simulates 2,000 matches per season across 30 independent seasons, with lobby selection, team assignment, and stat generation seeded from each player's real per-game averages, rating updates, and full season telemetry (spread checkpoints, win/draw/upset rates, team balance, economy audits, per-stat correlation analysis). Re-simulated July 2026 on refreshed match data. Source and full run history available on request.*
