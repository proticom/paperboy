---
name: tauri-sign
description: Sign and notarize the paperboy-app macOS .app and .dmg so they pass Gatekeeper without "unidentified developer" warnings. Use after `npm run tauri:build` produces an unsigned .app under src-tauri/target/release/bundle/. Requires Apple Developer ID Application certificate in the login keychain and an App Store Connect API key for notarization.
disable-model-invocation: true
---

# Sign + notarize paperboy.app

Apple wants every macOS app distributed outside the Mac App Store to be signed with a Developer ID certificate AND notarized by Apple's notary service AND have the notarization ticket stapled to the .app/.dmg. This skill is the 6-step recipe nobody remembers two months later.

## Prerequisites (one-time setup the user does)

Confirm these exist before starting — abort with clear instructions if any are missing:

1. **Developer ID certificate** in login keychain:
   ```bash
   security find-identity -v -p codesigning | grep "Developer ID Application"
   ```
   Should print exactly one identity. If zero, the user needs to create one in [developer.apple.com](https://developer.apple.com/account/resources/certificates) and download it.

2. **App Store Connect API key** stored as a notarytool credential profile. Confirm via:
   ```bash
   xcrun notarytool history --keychain-profile "paperboy-notary" 2>&1 | head -5
   ```
   If the profile doesn't exist, the user creates it once with:
   ```bash
   xcrun notarytool store-credentials "paperboy-notary" \
     --apple-id "<apple-id-email>" \
     --team-id "<10-char-team-id>" \
     --password "<app-specific-password>"
   ```

3. **Build output exists.** Confirm `paperboy-app/src-tauri/target/release/bundle/macos/Paperboy.app` is present. If not, run `npm run tauri:build` from `paperboy-app/` first.

## Steps

Variables — fill these in at the top:

```bash
APP_PATH="paperboy-app/src-tauri/target/release/bundle/macos/Paperboy.app"
DMG_PATH="paperboy-app/src-tauri/target/release/bundle/dmg/Paperboy_<version>_aarch64.dmg"
SIGNING_IDENTITY="Developer ID Application: <Your Name> (<TEAM_ID>)"
NOTARY_PROFILE="paperboy-notary"
ZIP_PATH="/tmp/Paperboy-notarize.zip"
```

1. **Sign the .app.** Deep, with hardened runtime + timestamp.
   ```bash
   codesign --force --deep --options runtime --timestamp \
     --sign "$SIGNING_IDENTITY" "$APP_PATH"
   ```

2. **Verify signature.** Should print "valid on disk" + "satisfies its Designated Requirement".
   ```bash
   codesign --verify --deep --strict --verbose=2 "$APP_PATH"
   ```

3. **Ditto into a zip for notarization.** notarytool wants .zip, .dmg, or .pkg.
   ```bash
   ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"
   ```

4. **Submit to Apple notary.** `--wait` blocks until Apple returns (usually 1-5 min).
   ```bash
   xcrun notarytool submit "$ZIP_PATH" \
     --keychain-profile "$NOTARY_PROFILE" \
     --wait
   ```
   On `status: Accepted` → proceed. On `status: Invalid` → pull the log:
   ```bash
   xcrun notarytool log <submission-id> --keychain-profile "$NOTARY_PROFILE"
   ```

5. **Staple the ticket to the .app and .dmg.**
   ```bash
   xcrun stapler staple "$APP_PATH"
   xcrun stapler staple "$DMG_PATH"
   ```

6. **Final verification — Gatekeeper assessment.**
   ```bash
   spctl --assess --type execute --verbose "$APP_PATH"
   spctl --assess --type open --context context:primary-signature --verbose "$DMG_PATH"
   ```
   Both should print "accepted" with "source=Notarized Developer ID".

## Report back

- Signing identity used.
- Notarization submission ID.
- `spctl --assess` output for both .app and .dmg.
- Suggested next step: upload the .dmg to a GitHub Release (`gh release create v<version> "$DMG_PATH" --notes-from-tag`).

## What NOT to do

- Don't sign without `--options runtime`. macOS will reject the app from notarization if the hardened runtime is missing.
- Don't notarize a debug build. The build script must produce a release-mode binary (`npm run tauri:build`, not `tauri:dev`).
- Don't strip or re-sign Tauri's bundled binaries (`tauri.app/Contents/Frameworks/`) — `codesign --deep` handles them in the right order.
- Don't share the notary keychain profile across projects unintentionally — anyone with access to it can notarize as you.
