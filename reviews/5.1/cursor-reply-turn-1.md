# 5.1 — Builder Reply (Turn 1)

## Summary
Switched Tauri bundle targets from macOS-only `"app"` to cross-platform installers: `["dmg", "nsis", "deb", "appimage"]`.

## Changes

`paperboy-app/src-tauri/tauri.conf.json` — one field only:

```diff
-    "targets": "app",
+    "targets": ["dmg", "nsis", "deb", "appimage"],
```

No `bundle.macOS` / `bundle.windows` / `bundle.linux` blocks, no icon or CI edits (scoped to 5.2 / 5.4 / 5.6 / 5.7).

## Validation (exit 0)

```text
jq '.bundle.targets' → ["dmg","nsis","deb","appimage"]
node targets array check → OK
git diff --stat → 1 file, 1 insertion, 1 deletion
cargo check --offline → Finished
npm test --workspaces --if-present → 52/52 (5 suites)
npm run build --workspaces --if-present → green
npx tauri info → exit 0
```

Did not run full `tauri build` (per review: dmg bundler is expensive; gated to 5.6 CI).

## Definition of done
- [x] `bundle.targets` is the four-item array in exact order
- [x] Only `tauri.conf.json` touched
- [x] `cargo check` and workspace test/build green
