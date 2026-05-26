# 4.8 - Review Turn 1

## Task Context
- Task id: 4.8
- Task title: Replace alert() with toast notifications
- Dashboard implementation status: in_progress
- Review status: in_review
- Spec sections: paperboy_production_readiness_02f05849.plan.md §4.8 (line 97): "Replace blocking `alert()` in [src/scripts/bridge.js:382] with the existing toast system at [bridge.js:559-575]."
- Files inspected:
  - `paperboy-app/src/scripts/bridge.js` (640 lines)
- Commands run:
  - `grep -n "alert(" paperboy-app/src/scripts/bridge.js` → 2 hits at lines 400 and 419
  - `grep -rn "window\.alert\|window\.confirm\|window\.prompt" paperboy-app/src/ paperboy-app/src-tauri/` → 2 `alert()` (bridge.js:400, 419), plus intentional `window.confirm` fallbacks for `tauri.dialog.ask` at lines 206/213/347/353 — those are not in scope.
  - `node --check paperboy-app/src/scripts/bridge.js` → SYNTAX_OK
- Current claim being verified: Cursor has not started this task yet; both `window.alert(...)` calls remain in the source. No reply artifact exists under `reviews/4.8/`. Treat this as a fresh build prompt.

## Findings

### Finding 1: Two `window.alert(...)` calls still present in `bridge.js`
- Severity: blocker
- Location: `paperboy-app/src/scripts/bridge.js:400` and `paperboy-app/src/scripts/bridge.js:419`
- Problem: Both call `window.alert(...)`, which is the blocking modal the plan §4.8 explicitly calls out. The toast helper (`showToast(message, kind = "info")`) is defined in the same file at **line 624** (the plan's `:559-575` reference is stale but unambiguous — there is exactly one toast helper in the file) and is already used at lines 379, 403, 418, 429.
- Spec mismatch / risk: Plan §4.8 mandates non-blocking toast UX. Native `alert()` also looks wrong in a Tauri webview (un-styled OS modal) and breaks the post-import flow because line 402's `ui.setViewMode("preview")` and the success toast at line 403 are queued behind the blocking modal at line 400.
- Required fix: Replace both `window.alert(...)` calls with `showToast(...)`, choose the right `kind`, and remove the redundant error-path duplication (line 418 already shows a toast immediately before the alert at 419).
- Code sample / exact change:

  At line 399–401 (warnings on successful import — currently *only* alerts, no toast):
  ```js
  if (result.warnings.length > 0) {
    showToast(
      `Converted with warnings: ${result.warnings.join("; ")}`,
      "info"
    );
  }
  ```
  Notes for builder:
  - Use kind `"info"` (not `"error"`) — the conversion succeeded; warnings are informational. Matches the existing convention (errors at 418/429 use `"error"`; success at 403 uses `"success"`).
  - Collapse the multi-line `\n- item` formatting into a single-line toast — toasts are not modals and don't render multi-line bullet lists well. Joining with `"; "` keeps it scannable.

  At line 416–420 (error path — toast already exists at 418; the `alert` at 419 is redundant):
  ```js
  } catch (error) {
    console.error("Failed to import file", error);
    showToast("Paperboy could not import this file.", "error");
  }
  ```
  Notes for builder:
  - Just delete line 419. Line 418's `showToast(..., "error")` already covers the user-facing notification.

- Validation:
  ```
  grep -n "window\.alert\|alert(" paperboy-app/src/scripts/bridge.js
  ```
  Expected output: no matches.
  ```
  node --check paperboy-app/src/scripts/bridge.js
  ```
  Expected: exits 0.

### Finding 2: Confirm no other `alert()` calls remain in the desktop app
- Severity: required
- Location: `paperboy-app/src/` (all `.js`, `.html`, `.css`)
- Problem: The plan only names `bridge.js`, but the review must verify the change is complete across the desktop app, not just one file.
- Spec mismatch / risk: Leaving a stray `alert()` in another module would re-introduce the same blocking-modal UX.
- Required fix: After applying Finding 1, re-run the codebase-wide grep. If hits exist in other files, replace them too with `showToast(...)`; otherwise note "no additional alerts" in the reply.
- Code sample / exact change: N/A — verification only.
- Validation:
  ```
  grep -rn "\balert(" paperboy-app/src/
  ```
  Expected: no matches outside of strings/comments. (Today this grep returns only the two hits in bridge.js, so removing them should produce zero matches.)

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: Remove the two `window.alert(...)` calls in `paperboy-app/src/scripts/bridge.js` (lines 400 and 419) and replace them with the existing `showToast(...)` helper defined at line 624 in the same file. The plan §4.8 references `bridge.js:382` and `bridge.js:559-575`; those line numbers are stale — the alerts are now at 400/419 and `showToast` is at 624.

Files to edit:
- `paperboy-app/src/scripts/bridge.js`

Files not to edit:
- Anything else. The `window.confirm(...)` fallbacks at lines 206, 213, 347, 353 are intentional fallbacks for `tauri.dialog.ask` and **must not** be touched.

Exact changes:

1. Replace lines 399–401:
   ```js
       if (result.warnings.length > 0) {
         window.alert(`Converted with warnings:\n\n${result.warnings.map((warning) => `- ${warning}`).join("\n")}`);
       }
   ```
   with:
   ```js
       if (result.warnings.length > 0) {
         showToast(
           `Converted with warnings: ${result.warnings.join("; ")}`,
           "info"
         );
       }
   ```

2. Delete line 419 entirely (the `window.alert("Paperboy could not import this file.");` immediately after the existing `showToast(..., "error")` at line 418). The resulting `catch` block should be:
   ```js
     } catch (error) {
       console.error("Failed to import file", error);
       showToast("Paperboy could not import this file.", "error");
     }
   ```

Data shapes / CLI examples: N/A — pure refactor.

Tests to add or update: None. No unit tests cover this path today. Manual verification via the dev app is sufficient for review_passed.

Commands to run (all from monorepo root):
```
grep -n "alert(" paperboy-app/src/scripts/bridge.js
grep -rn "\balert(" paperboy-app/src/
node --check paperboy-app/src/scripts/bridge.js
npm run build --workspace paperboy-app --if-present
```

Definition of done:
- Both `grep` commands above print no matches.
- `node --check` exits 0.
- `npm run build --workspace paperboy-app --if-present` exits 0 (or prints "no build script" — paperboy-app's actual build is the cargo/tauri bundle; a frontend syntax check is sufficient for review).
- The reply artifact at `reviews/4.8/cursor-reply-turn-1.md` lists the diff hunk(s) and the grep outputs.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions.

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
Blocker: 2 `window.alert()` calls still present (bridge.js:400, 419). Replace L400 with `showToast(..., "info")` (warnings are informational, not errors), delete L419 (line 418 already shows the error toast). Plan's `:382`/`:559-575` line refs are stale — alerts are at 400/419, `showToast` at 624.
