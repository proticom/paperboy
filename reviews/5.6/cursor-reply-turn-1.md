# 5.6 — Builder Reply (Turn 1)

## Summary
Added `.github/workflows/release-desktop.yml` — desktop release CI on `app-v*` tags using `tauri-apps/tauri-action@v0`, with manifest generation and optional paperboy-site PR.

## Changes

**New:** `.github/workflows/release-desktop.yml`

- **Trigger:** `app-v*` tags; `concurrency` cancels in-progress reruns
- **Jobs:** `create-release` (draft) → `build` matrix (`macos-14` universal, `windows-2022`, `ubuntu-22.04`) → `publish-release` (publish + manifests)
- **Build:** `npm ci`, `sync:vendor`, `tauri-action` with Apple/Windows/updater secrets (empty secrets soft-skip inside action)
- **Manifests:** `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64` only (no Linux); artifact upload always; site PR when `PAPERBOY_SITE_PUSH_TOKEN` set (`git push -f`)

Minor deviations from review draft: separate `rustup target add` for mac (empty `targets` on win/linux); manifest JSON via `jq -n` (valid JSON); ubuntu-22.04 comment notes 24.04 fallback.

## Validation

```text
ruby -ryaml → YAML OK
git status → only .github/workflows/release-desktop.yml (new)
grep tauri-apps/tauri-action → 1 hit
grep if: env.SITE_TOKEN → 1 hit
npm test --workspaces --if-present → 52/52
npm run build --workspaces --if-present → green
jq bundle.targets / plugins.updater → intact
```

## Definition of done
- [x] Single new workflow file
- [x] 3-job topology + tauri-action + soft-guards
- [x] No app/site/package.json changes
- [x] Workspace tests green
