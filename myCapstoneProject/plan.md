Group OTT Movie Picker — Project Plan
5 people, combined preferences, 5 movie options

1. Concept
A group version of the "Netflix Indecision Solver" idea. Instead of one person scrolling endlessly, 5 people each contribute their preferences, and the system returns 5 movie options that work for the group — bounded, shared decision instead of individual browsing.

2. What kind of AI agent this is
Same category as before: a constrained decision agent, not a generative one. It filters and ranks real content data against structured preference inputs from multiple people, then returns a bounded set.
Core logic: rules-based aggregation and scoring across 5 preference profiles — no ML training required.
Optional LLM layer: could interpret free-text preferences later ("I'm in the mood for something dark") or write a one-line pitch for each of the 5 results. Not needed for the core logic.

3. Data source situation
Neither Netflix nor Amazon Prime Video offer a public API for third-party developers to access personal watch history — Netflix retired its developer API program entirely, and Prime Video has never offered one. This rules out "automatically pull everyone's history."
Two data needs, two different sources:
Personal preferences → manual input from each person (liked genres, a few liked titles, disliked genres/titles, which platforms they have access to). This replaces "pulling history."
What's actually available to watch → a catalog API (JustWatch, Watchmode, or TMDb) for titles, genre metadata, ratings, and which platform each title streams on.

4. Inputs, per person
FieldPurposeLiked genresCore preference signalA few liked titlesOptional, more specific signal than genre aloneDisliked genres/titlesUsed for exclusion, not just deprioritizationPlatforms they have access toDetermines what's actually watchable by the group
Collected once per person (manually, via a short form), not pulled automatically.

5. Architecture
Each of the 5 people fills a short preference profile.
The app sends all 5 profiles to your backend.
Backend determines the group's combined platform access — only titles available on a platform at least one relevant person has should be considered (or, more strictly, only platforms shared by enough of the group).
Backend queries the catalog API for titles matching the group's genre interests, restricted to available platforms.
Backend applies hard exclusions — a title disliked or genre-excluded by any one person is dropped outright, rather than just down-weighted.
Backend scores the remaining titles against the group's combined liked genres/titles.
Backend returns the top 5 titles.
The group looks at the 5 together and picks — the group decision itself is the intended final step, not something the system resolves for them.

6. The aggregation question (the core design decision here)
This is the piece that didn't exist in the single-user restaurant version — reconciling 5 different preference sets into one shortlist. Two approaches, worth deciding explicitly:
Averaging: score each title by how well it matches each person's preferences, then average across the 5. Simple, but risks steamrolling a minority preference (4 people who love horror can outvote 1 person who hates it).
Veto-on-dislike: any title a person has explicitly marked as disliked, or that falls in a genre they've excluded, is removed from consideration entirely before scoring the rest. This is closer to how a real group actually negotiates ("anything but horror, please") and avoids surfacing options that will just get shot down anyway.

Recommended default: veto-on-dislike for hard exclusions, averaging for ranking what's left. This mirrors real group decision-making more closely than pure averaging alone, and is what your persona set (built with a deliberate outlier) is specifically designed to test.

7. Memory architecture needed
None, for this MVP. Every session is a fresh set of 5 manually entered profiles — no persistence required. This avoids RAG or graph-database complexity entirely for now.
RAG would only become relevant if preference input moves from fixed fields to free text you need to interpret semantically.
Graph would only become relevant if the app starts tracking relationships over time — recurring watch groups, shared history, "this group tends to agree on X" — none of which is in scope yet.

8. Human-in / on / out of the loop
This is different from the earlier restaurant version, and worth stating clearly:
The per-session recommendation step (steps 3–7) is out-of-the-loop — no human approves the scoring or filtering before the 5 results are generated.
The final pick is deliberately human-in-the-loop — unlike the restaurant version's single forced pick, this system's whole point is to hand the group a short, workable list and let them decide together. The system's job is to narrow, not to decide.
Persona/data maintenance (adjusting genre tags or catalog matching over time) stays a human task done periodically, separate from the live recommendation flow — same pattern as the cuisine-keyword maintenance in the earlier plan.

9. Skills needed
API integration — calling the catalog API (JustWatch/Watchmode/TMDb), handling its data, managing keys.
Basic backend logic — building the exclusion + scoring rules across 5 profiles; still plain conditional logic and arithmetic, not machine learning.
A simple multi-person input flow — 5 short forms instead of 1, and a shared results screen the whole group can see.
Persona design discipline — building deliberately conflicting test personas (shared interests + a genuine outlier) so the aggregation logic gets properly stress-tested before real users touch it.
Optional, later: LLM prompting, only if free-text preference input gets added.

10. MVP scope
5 manual preference profiles (liked/disliked genres, a few titles, platform access) — no automatic history pulling.
Catalog API (JustWatch/Watchmode/TMDb) for content and platform-availability data.
Hard exclusion on disliked genres/titles, averaged scoring on what remains.
Output: exactly 5 movie options, shown to the whole group.
Prototype using deliberately conflicting made-up personas before onboarding real users.
Deliberately out of scope for MVP: automatic watch-history import (not possible via API anyway), free-text preference interpretation, recurring-group memory/history, social features.

11. Open decisions
Aggregation rule: confirm veto-on-dislike + averaging, or test a different weighting once persona results come back.
Platform-access rule: does a title need to be available to all 5, or just enough of the group? This affects how many results survive filtering.
Backend platform: serverless function vs. small dedicated server vs. no-code tool — same open question as before, now applied to a different data source.