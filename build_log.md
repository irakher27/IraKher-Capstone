# Build Log

## Running total (as of 2026-09-19)
- **Cumulative time: ~10.5 hours** across the whole project (Assessment 2 + today).
  - Note: the two entries below dated 2026-09-17 have identical text to the two
    dated 2026-09-18, and git history shows that work (Skill/adapter/agent
    loop/MCP wiring, then the viewers/onboarding-prep pass) was actually
    committed on 2026-09-18 — the real 2026-09-17 commits were an earlier,
    more primitive version. Treating this as a mis-dated duplicate and
    counting that ~4h once, not twice. Flag me if 2026-09-17 was actually a
    separate session and this should be corrected instead.
  - Breakdown: ~4h (2026-09-18: Skill/adapter/agent loop/MCP wiring, then
    visualization pages + onboarding prep) + ~6.5h (2026-09-19: everything in
    today's entry below).
- **Approx tokens used: not precisely tracked**, same as every entry below —
  there's no reliable way to pull actual token-usage numbers from inside a
  conversation, so this has never been a real measurement, just a placeholder.

## [2026-09-17]
- Time spent: ~2 hour
- Approx tokens used: ~X tokens across sessions, not precisely tracked
- What shipped: Built the group movie-picker capstone Skill (scoreGroupMovies.js — hard-excludes any movie disliked by a persona, then scores and ranks the rest by group fit). Built an OMDb adapter to fetch and reshape real movie data. Built the agent loop (runWorkflow.js) implementing perceive → act → observe → reason → act again: loads persona profiles, fetches candidate movies from OMDb, scores them through the Skill, and retries with a loosened platform check when too few results survive. Wired in filesystem MCP so the agent reads persona files and writes results.json through the MCP connector rather than direct file I/O. Full workflow runs end-to-end on real persona input and produces real ranked movie output.

## [2026-09-17]
- Time spent: ~2 hour
- Approx tokens used: ~X tokens across sessions, not precisely tracked
- What shipped: Added a .gitignore (.env, node_modules) and a Node package.json so the project actually installs and runs. Built three visualization layers on top of the existing pipeline: viewer.html (final ranked results as cards), process.html (a 6-step walkthrough — personas, fetched candidates, attempt 1 scoring with per-persona veto reasons, the agent's reasoning, attempt 2, final ranking), and site.html (the actual end-user journey — pick who's watching, animated "working" steps, ranked picks). Upgraded site.html so it's not just a mockup: the real scoreGroupMovies skill and the real fetched candidate movies are embedded and rerun live in the browser against whichever personas are checked, so different group selections genuinely produce different rankings. Renamed the five personas from generic "Persona N" labels to real names (Ira, Richa, Avani, Neela, Arunima) across the data files and every generated page. Started this build log.


## [2026-09-18]
- Time spent: ~2 hour
- Approx tokens used: ~X tokens across sessions, not precisely tracked
- What shipped: Built the group movie-picker capstone Skill (scoreGroupMovies.js — hard-excludes any movie disliked by a persona, then scores and ranks the rest by group fit). Built an OMDb adapter to fetch and reshape real movie data. Built the agent loop (runWorkflow.js) implementing perceive → act → observe → reason → act again: loads persona profiles, fetches candidate movies from OMDb, scores them through the Skill, and retries with a loosened platform check when too few results survive. Wired in filesystem MCP so the agent reads persona files and writes results.json through the MCP connector rather than direct file I/O. Full workflow runs end-to-end on real persona input and produces real ranked movie output.

## [2026-09-18]
- Time spent: ~2 hour
- Approx tokens used: ~X tokens across sessions, not precisely tracked
- What shipped: Added a .gitignore (.env, node_modules) and a Node package.json so the project actually installs and runs. Built three visualization layers on top of the existing pipeline: viewer.html (final ranked results as cards), process.html (a 6-step walkthrough — personas, fetched candidates, attempt 1 scoring with per-persona veto reasons, the agent's reasoning, attempt 2, final ranking), and site.html (the actual end-user journey — pick who's watching, animated "working" steps, ranked picks). Upgraded site.html so it's not just a mockup: the real scoreGroupMovies skill and the real fetched candidate movies are embedded and rerun live in the browser against whichever personas are checked, so different group selections genuinely produce different rankings. Renamed the five personas from generic "Persona N" labels to real names (Ira, Richa, Avani, Neela, Arunima) across the data files and every generated page. Started this build log.

## [2026-09-19]
- Time spent: ~6.5 hours (estimated from commit timestamps, 13:22–19:10, plus pre-commit and this finalization pass)
- Approx tokens used: ~X tokens across sessions, not precisely tracked
- What shipped: Expanded the candidate movie list to 159 titles and the recognized genre vocabulary (Musical, Autobiography, Horror, Romance, Comedy, Thriller, Sci-Fi, Action, Adventure, Drama, Fantasy — removed redundant RomCom/Raunchy Comedy since they're just Romance/Comedy combos). Fixed several real matching/logic bugs in scoreGroupMovies.js: previously-liked titles are now excluded from someone's own recommendations instead of being re-suggested, genre/title matching is case- and whitespace-insensitive, duplicate candidates are de-duplicated, and a real quota-vs-not-found ambiguity in the OMDb adapter (both were silently treated as "not found," hiding actual API failures) now throws a clear error. Added local caching for OMDb lookups so the same title is never re-fetched from the network twice, protecting against OMDb's 1,000-request/day free-tier limit. Replaced the static personas/*.json test files with a real multi-user onboarding flow: people sign in with Google (OAuth 2.0, via server/googleAuth.js), answer a short form (works solo or as a group, no hardcoded minimum), their preferences save to disk keyed by email (server/profileStore.js) and are editable anytime through a persistent profile badge/modal, and "Get recommendations" runs the exact same agent loop against whoever just answered — no static persona files involved. Made the app deployable: reads Railway's injected PORT and a configurable PUBLIC_BASE_URL/DATA_DIR instead of assuming localhost, added railway.toml, and wrote the project's README.md. Finished with a verification pass confirming the Skill/agent loop/MCP mechanism is still genuinely exercised by the live app and that the failure-handling from earlier (bad titles, empty results, already-liked exclusion) still works correctly end-to-end.
