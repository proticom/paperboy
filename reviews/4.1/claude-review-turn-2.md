# 4.1 - Review Turn 2

## Task Context
- Task id: 4.1
- Task title: Extract @proticom/paperboy-ai shared package from CLI
- Dashboard implementation status: done
- Review status: in_review → review_passed
- Spec sections: Phase 4 item **4.1** — separate package (converter browser-safe; AI providers Node-only);
  one source of truth for OpenRouter/OpenAI/Anthropic/xAI/Ollama/local-endpoint.
- Builder reply verified: `reviews/4.1/cursor-reply-turn-1.md`
- Turn-1 required finding: extract the package AND decouple `ai.ts` from the CLI's `config`/`getApiKey`,
  with no backwards dependency on the CLI. Verified below against the real repo.

## Findings

### Finding 1 (turn 1): package created AND ai.ts decoupled — RESOLVED, verified
- Severity: required (was the crux of the task)
- Verified in repo, not trusted from the reply:
  - `paperboy-ai/` exists: `package.json`, `tsconfig.json`, `vitest.config.ts`, `LICENSE`, `README.md`,
    `src/{ai,providers,index}.ts`, `tests/{ai,providers}.test.ts`, built `dist/`.
  - **Decoupling confirmed** in `paperboy-ai/src/ai.ts`: public `describeImageWithAi(params)` takes
    `aiConfig: AiConfig` (`{ mode, baseUrl?, model? }`) + caller-supplied `apiKey: string`; no import of
    CLI `config`/`getApiKey`. `OcrWordPosition` is pulled via `import type { OcrWordPosition } from
    "@proticom/paperboy-converter"` (zero runtime coupling), and the converter exports that type
    (`paperboy-converter/src/index.ts:20,94`; `dist/index.d.ts`).
  - **No backwards dependency**: `grep -rn "paperboy-cli" paperboy-ai/src` → empty (exit 1);
    `grep -rnE "getApiKey|PaperboyCliConfig|from \"\./config" paperboy-ai/src` → empty.
  - **CLI files removed**: `paperboy-cli/src/{ai,providers}.ts` deleted (git shows `D`);
    `grep -rnE 'from "\./ai|from "\./providers' paperboy-cli/src` → empty.
  - **CLI rewired correctly**: `cli.ts` imports `{ describeImageWithAi, getProvider }` from
    `@proticom/paperboy-ai`, resolves `apiKey = getApiKey(getProvider(config.ai.mode).envVar ?? "")` in
    the CLI, and passes `{ aiConfig: config.ai, apiKey, imageBytes, imageMimeType, ocrText, words }`.
    `config.ts` + `setup.ts` import `PROVIDERS`/`getProvider`/`listProvidersForSetup`/`fetchOpenRouterModels`
    from the package.
  - **Monorepo wiring**: root `workspaces` includes `paperboy-ai` (ordered after converter, before cli);
    `paperboy-cli/package.json` depends on `"@proticom/paperboy-ai": "*"`; lockfile updated.
  - **Behavior preserved vs git HEAD**: original `ai.ts` dispatched on `config.ai.mode` (HEAD line 378) and
    resolved `getApiKey(provider.envVar)` per call — the new code keeps the same dispatch keys
    (disabled/openrouter/openai/anthropic/xai/ollama/local-endpoint) and hoists the single apiKey
    resolution to the CLI caller. No semantic change.
- Validation: (re-run by reviewer, exit codes captured)
```
ls paperboy-ai/{package.json,src/ai.ts,src/providers.ts,src/index.ts}   # all present
grep -rn "paperboy-cli" paperboy-ai/src                                  # empty  (exit 1)
grep -rnE 'from "\./ai|from "\./providers' paperboy-cli/src              # empty  (exit 1)
npm install                                                              # exit 0
npm run build     --workspaces --if-present                              # exit 0 (paperboy-ai built)
npm run typecheck --workspaces --if-present                              # exit 0
npm test          --workspaces --if-present                              # exit 0 — converter 9, ai 5, cli 19, widget 12
```
- Tests inspected (not just counted): `paperboy-ai/tests/ai.test.ts` mocks `fetch` and asserts
  `mode:"disabled"` → null and `mode:"openrouter"` dispatches once; `providers.test.ts` covers
  `getProvider` fallback/resolution and `listProvidersForSetup` filtering. Meaningful, not placeholders.

## Builder Prompt
No further action required. Task satisfied.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A (no open blockers; turn-1 required finding resolved)
- [x] Every required finding has a validation command — re-run by reviewer, all green
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions: No open questions. (Turn-1 open question on `OcrWordPosition` source resolved: builder
used `import type` from `@proticom/paperboy-converter`, the recommended zero-runtime-coupling option.)

## Decision
review_passed
