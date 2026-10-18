<!-- GNOSYS:START -->
## Gnosys Memory System

This project uses **Gnosys** for persistent memory via MCP. Gnosys uses a centralized brain (`~/.gnosys/gnosys.db`) shared across all projects with project, user, and global scopes.

### Read first

- At task start, call `gnosys_discover` with relevant keywords
- Load results with `gnosys_read`
- When the user references past decisions, says "recall", "remember when", "what did we decide" — search memory first
- Use `gnosys_federated_search` for cross-project search with scope boosting
- Use `gnosys_working_set` to see recently modified memories for context

### Write automatically

- When user says "remember", "memorize", "save this", "note this down", "don't forget" — call `gnosys_add`
- When user states a decision or preference (even casually) — commit to `decisions` category
- When user provides a spec or plan — commit BEFORE starting work
- After significant implementation — commit findings and gotchas
- User preferences (coding style, conventions) — use `gnosys_preference_set`

### Key tools

| Action | Tool |
|--------|------|
| Find memories | `gnosys_discover` (metadata) → `gnosys_read` (content) |
| Search | `gnosys_hybrid_search` (best), `gnosys_federated_search` (cross-project), `gnosys_search` (keyword), `gnosys_ask` (Q&A) |
| Write | `gnosys_add` (freeform), `gnosys_add_structured` (explicit fields) |
| Update | `gnosys_update`, `gnosys_reinforce` (useful/not_relevant/outdated) |
| Browse | `gnosys_list`, `gnosys_lens` (filtered), `gnosys_tags`, `gnosys_graph` |
| Maintain | `gnosys_maintain`, `gnosys_stale`, `gnosys_history`, `gnosys_dashboard` |
| Preferences | `gnosys_preference_set`, `gnosys_preference_get`, `gnosys_preference_delete` |
| Projects | `gnosys_init` (register), `gnosys_briefing` (status), `gnosys_stores` (debug) |
| Context | `gnosys_federated_search`, `gnosys_working_set`, `gnosys_detect_ambiguity` |
| Recall | `gnosys_recall` (fast context injection, sub-50ms) |
| Export | `gnosys_export` (Obsidian vault), `gnosys_audit` (operation trail) |

### Project routing

**IMPORTANT:** Always pass the `projectRoot` parameter with every Gnosys tool call, set to the workspace root directory. This ensures memories are stored and retrieved for the correct project. Without it, Gnosys may route to the wrong project in multi-project setups.

### Categories

`architecture` · `decisions` · `requirements` · `concepts` · `roadmap` · `landscape` · `open-questions`

### Project conventions

- **Extension preview toggle scope**: Extension side panel has a 2-button pill toggle (Source / Preview) in the header, mirroring the app's view-toggle but only 2 positions instead of 3.
- **M045 — Design Decisions Summary**: Key design decisions: (1) Sharp corners everywhere — border radius defaults to 0. (2) Geist Mono is the primary typeface for body, labels, and UI chrome; Geist Sans for h1-h6 hero headings only; Geist Pixel reserved for accent. (3) No external UI component libraries — all components hand-built. (4) Icons exclusively from `lucide-react` and SVG files — no emoji in UI. (5) Dark theme is the default. (6) The markdown view toggle is a brand/personality feature. (7) The gradient border hover effect is a signature interaction pattern. (8) The home hero uses canvas 2D, not WebGL/Three.js (the WebGL experiments are at /v2-v5 only). (9) Content is data-driven from YAML, not hardcoded in page components. (10) The site publishes llms.txt for AI crawlers as part of GEO strategy. (11) "Operator not advisor" aesthetic — live system UI, status-bar labels, command-center look. (12) No stock photography, no gradient backgrounds, no bubbly rounded SaaS UI, no people-in-meetings imagery.
- **M054 — Content Integrity: Fabricated Stats Removed**: Content integrity decisions made in Phase 3 (PR #66): Fabricated statistics were explicitly removed — fake "50+ clients", "7 AI models", "15 agents", "99.9% uptime SLA" were all deleted. Approved stats only: `29 years`, `100+ clients`, `200+ projects`, `5 AI products`. Defense vertical was removed entirely (page, nav, footer, homepage, about, site-knowledge). "15 years healthcare" was removed from all non-healthcare pages (the healthcare page keeps it in appropriate context). Rule: never fabricate numbers or statistics on the site.
- **M061 — CLAW Terminology Integration (Phase 9)**: Phase 9 — CLAW Terminology Integration (PRs 92-93). Context: "Claw" became mainstream term for autonomous AI agents. OpenClaw (250K+ GitHub stars), NVIDIA NemoClaw for enterprise, Jensen Huang's claw strategy framing.
- **M063 — Email Domain Standardisation**: Email addresses standardised across all pages: `@proticom.ai` → `@proticom.com`. This change was made in Phase 2 and reinforced in Phase 4 (PRs 70-78). The canonical contact email is `contact@proticom.com`. All page references, footer, contact forms, and site knowledge use `@proticom.com`.
- **Paperboy fonts**: Paperboy uses two canonical fonts across all packages, plus two display fonts on the marketing site only.
- **npm workspaces conversion (2026-05): converter symlinked across consumers**: **Decision (2026-05-17, commit `14cea4b`):** The monorepo is now an npm workspaces project. Workspace members: `paperboy-converter`, `paperboy-cli`, `paperboy-app`, `paperboy-ext`. The site (`paperboy-site/`) is **not** a workspace member — it's a separate Git repo (Vercel-deployed) that still consumes the converter as a vendored `.tgz`.
- **Site ships a vendored widget bundle**: The site currently ships its own vendored copy of the widget bundle (`public/widget/paperboy-widget.min.js`). That file is no longer built from this repo. The Newspaper/Markdown toggle in the site masthead still uses that vendored bundle.
- **Codebase cleanup audit — 2026-05-19, -1862 lines across 9 modules**: Ran `/safe-isomorphic-code-cleanup` across the monorepo + paperboy-site in leaf-first order with gated approval at each module. **-1862 lines total**, all builds + tests green.
- **CARGO_TARGET_DIR scoping — /cargo-build skill, not ~/.zshrc export**: Decision (2026-05-19, supersedes prior "put it in ~/.zshrc" guidance):
<!-- GNOSYS:END -->
