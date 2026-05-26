# 4.1 - Builder Reply Turn 1

## Task Context
- Task id: 4.1
- Review artifact: `reviews/4.1/claude-review-turn-1.md`
- Builder: cursor

## Changes Made

Created `@proticom/paperboy-ai` workspace package:

- `paperboy-ai/package.json`, `tsconfig.json`, `LICENSE`, `README.md`
- Moved `providers.ts` verbatim; moved + decoupled `ai.ts` (`AiConfig` + caller-supplied `apiKey`; `import type { OcrWordPosition }` from converter)
- `paperboy-ai/src/index.ts` re-exports public API
- Tests: `tests/providers.test.ts`, `tests/ai.test.ts`

Monorepo + CLI rewiring:

- Root `workspaces` includes `paperboy-ai`
- `paperboy-cli` depends on `@proticom/paperboy-ai`
- `cli.ts` resolves `apiKey` via `getApiKey(getProvider(...).envVar)` and passes `aiConfig: config.ai`
- `config.ts` / `setup.ts` import providers + `fetchOpenRouterModels` from package
- Deleted `paperboy-cli/src/{ai,providers}.ts`

## Validation

```
ls paperboy-ai/package.json paperboy-ai/src/{ai,providers,index}.ts
grep -rn "paperboy-cli" paperboy-ai/src   # empty
grep -rn 'from "./ai\|from "./providers' paperboy-cli/src   # empty
npm install
npm run build --workspaces --if-present     # pass
npm run typecheck --workspaces --if-present # pass
npm test --workspaces --if-present            # converter 9, ai 5, cli 19, widget 12
```

## Builder Response
Used `import type` from `@proticom/paperboy-converter` for `OcrWordPosition` (zero runtime coupling). Required finding addressed.
