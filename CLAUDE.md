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

### User preferences

- **Edward assistant collaboration preferences**: Persistent working preferences to follow in coding sessions:

- Explanations should be beginner-friendly with simple wording and real-world examples.
- Avoid heavy jargon and advanced theory unless necessary; define terms plainly when used.
- Prefer straightforward, readable solutions over clever or over-engineered ones.
- Keep implementation practical and avoid unnecessary complexity.
- For UI assets: do not use emoji in UI elements; use Font Awesome or Google icons.
- Prefer SVG for logos/graphics so themes can recolor them easily.
- When code is shown for learning, include clear step-by-step comments.
- **Explanation Style**: beginner-friendly plain language with examples
- **Ui Icon Guideline**: no emoji in UI; use Font Awesome or Google icons; prefer SVG assets
- **Engineering Style**: prefer simple readable solutions; do not over engineer

### Project conventions

- **Extension preview toggle: Source/Preview, no split**: Extension side panel has a 2-button pill toggle (Source / Preview) in the header, mirroring the app's view-toggle but only 2 positions instead of 3.
- **macOS NAS mount stability (no AutoFS)**: Project source lives on Synology NAS at /Volumes/Dev/projects/paperboy/ (moved from iCloud Drive). The volume unmounts on display sleep, breaking dev.
- **Browser extension preview toggle: 2-button source/preview, no plugins, no scroll sync**: Browser extension preview toggle: 2-button pill toggle (Source / Preview) in the side panel header, mirroring the app's view-toggle but only 2 positions instead of 3 (no split view, no scroll sync). Uses markdown-it core with no plugins (deliberately simpler than the app, which uses footnote/deflist/mark/sub/sup/task-lists). Defaults to source view because the dominant workflow is extract-then-copy-markdown.
- **macOS NAS mount stability: no AutoFS, use Energy + Login Items + Keychain**: macOS NAS mount stability for Synology Dev share: rejected AutoFS due to plaintext password concern.
<!-- GNOSYS:END -->
