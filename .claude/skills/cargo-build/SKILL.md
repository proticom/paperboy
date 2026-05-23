---
name: cargo-build
description: Build the paperboy-app Tauri release bundle (the macOS .app), with CARGO_TARGET_DIR exported to a local-SSD cache so the build takes ~5 min instead of ~60 min. Source lives on a Synology NAS where the ~700 Rust crates blow up small-file I/O. Use whenever you need a fresh .app — either to test changes locally or to install for use.
---

# Build the Paperboy macOS .app

The paperboy monorepo lives on a Synology NAS share (`/Volumes/Dev/projects/paperboy/`). Compiling Rust in place — with the `target/` directory on the NAS — is **~10× slower** because Cargo writes hundreds of thousands of small files during a release build, and can occasionally fail on file metadata.

The fix: point `CARGO_TARGET_DIR` at a local-SSD cache (`~/.cache/paperboy-target`) for the duration of the build. This skill does that **inline for each build invocation** instead of leaving the env var globally set across all shells (which would dump every Rust project's artifacts into the same paperboy-named directory).

## When to run

- After any change to `paperboy-app/src-tauri/src/` (Rust) — needs a rebuild before changes are reflected.
- After any change to `paperboy-app/src/scripts/` (JS frontend), `paperboy-app/src/styles/` (CSS), or `paperboy-app/src/index.html` — needs `npm run sync:vendor` first (vendors deps), then a rebuild to embed.
- After any change to `paperboy-app/src-tauri/tauri.conf.json` (file associations, bundle config, window settings) — needs a full rebuild for the Info.plist to regenerate.
- When the user wants a fresh `.app` to install or test.

## Mode

This skill defaults to **release** mode (the production `.app`). Dev mode (`tauri dev`) is a different workflow — that's a long-running hot-reload server, not a one-shot build.

If the user says "dev" or "watch", run the dev variant in step 3 instead.

## Steps

1. **Confirm vendor sync is current.** If any file under `paperboy-app/src/scripts/`, `src/styles/`, or `src/index.html` is newer than `paperboy-app/src/scripts/vendor/converter.js`, run:
   ```bash
   (cd paperboy-app && npm run sync:vendor)
   ```

2. **Build the .app.** Set CARGO_TARGET_DIR inline so it scopes to this command only:
   ```bash
   CARGO_TARGET_DIR="$HOME/.cache/paperboy-target" \
     npm --workspace=paperboy-editor run tauri -- build
   ```
   Run from the monorepo root. First clean build ≈ 5 min using the cache; incremental ≈ 30 s – 2 min.

   **Dev mode variant** (if user asked for hot-reload):
   ```bash
   CARGO_TARGET_DIR="$HOME/.cache/paperboy-target" \
     npm --workspace=paperboy-editor run tauri -- dev
   ```
   Keep running until the user stops it.

3. **Report the bundle path.** With `CARGO_TARGET_DIR` redirected, the output lands at:
   ```
   ~/.cache/paperboy-target/release/bundle/macos/Paperboy.app
   ```
   Tell the user this path — not the in-tree `paperboy-app/src-tauri/target/` path (which won't exist in release mode after this skill ran, since cargo wrote everywhere else).

4. **If the user is installing,** offer the install + refresh sequence:
   ```bash
   cp -R ~/.cache/paperboy-target/release/bundle/macos/Paperboy.app /Applications/
   /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
     -f /Applications/Paperboy.app
   ```
   The `lsregister` is mandatory after any change to `tauri.conf.json` `bundle.fileAssociations` — Launch Services caches the old `Info.plist` aggressively and won't pick up new file associations until told.

5. **First-launch Gatekeeper note.** The build is unsigned. First time the user opens it:
   - Right-click → Open → confirm in dialog, or
   - `xattr -d com.apple.quarantine /Applications/Paperboy.app`

   For real distribution: the `/tauri-sign` skill handles signing + notarization.

## What NOT to do

- **Don't export `CARGO_TARGET_DIR` globally.** Setting it in `~/.zshrc` would point every Rust project on the machine at this paperboy-named cache and they'd invalidate each other's incremental builds. The whole point of this skill is to keep that scoped.
- **Don't auto-trigger this skill** during the `safe-isomorphic-code-cleanup` audit or any quick check — the 5-min rebuild is too heavy for an "is this still green?" question. For that, prefer `cargo clippy -p paperboy-editor` (~30 s with cache warm).
- **Don't try to clean and rebuild "for safety."** The cache is what makes this fast. If you want a true clean rebuild, delete `~/.cache/paperboy-target` first — but the user almost never wants this. Default to incremental.
- **Don't run `tauri build` from inside `paperboy-app/`** unless `CARGO_TARGET_DIR` is already set in the shell. Run from the monorepo root with the inline env var.
