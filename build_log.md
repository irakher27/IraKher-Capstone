# Build Log

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
