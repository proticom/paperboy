# 4.1 - Review Turn 1

## Task Context
- Task id: 4.1
- Task title: Extract @proticom/paperboy-ai shared package from CLI
- Dashboard implementation status: todo (in spec) — verified NOT done; package does not exist
- Review status: in_review → waiting_for_builder
- Spec sections: Phase 4 item **4.1** (recommend a SEPARATE package: converter is browser-safe,
  AI providers use Node fetch). One source of truth for OpenRouter/OpenAI/Anthropic/xAI/Ollama.
- Files inspected:
  - `paperboy-cli/src/ai.ts` (396 lines), `paperboy-cli/src/providers.ts` (118 lines)
  - consumers: `paperboy-cli/src/{cli.ts,setup.ts,config.ts}`
  - `paperboy-cli/package.json`, root `package.json` (workspaces)
- Commands run:
  - `grep -nE "^export|^import" paperboy-cli/src/{ai,providers}.ts`
  - `grep -rnE "from .\./(ai|providers)" paperboy-cli/src`
  - `grep -nE "getApiKey|PaperboyCliConfig|config\.|OcrWordPosition" paperboy-cli/src/ai.ts`
- Current claim being verified: a standalone `@proticom/paperboy-ai` package owns the AI/provider
  code with no backwards dependency on the CLI.

## Findings

### Finding 1: package doesn't exist; and ai.ts is coupled to the CLI (can't be moved as-is)
- Severity: required (this is the whole task; the coupling is the crux)
- Location: `paperboy-cli/src/ai.ts` imports `getApiKey` + `PaperboyCliConfig` from `./config.js`
  and `OcrWordPosition` from `./converter.js`.
- Problem: a naive move of `ai.ts`/`providers.ts` into `@proticom/paperboy-ai` would make the new
  shared package import from the CLI (`./config.js` → `getApiKey`, `PaperboyCliConfig`) — a
  backwards/circular dependency (shared pkg → app). `providers.ts` is self-contained and moves
  cleanly; `ai.ts` must be **decoupled** first:
  - `describeImageWithAi` reads `config.ai.{mode,baseUrl,model}` and calls
    `getApiKey(provider.envVar)` internally (lines 191/207/223/248/304/332/378). Env/keychain
    resolution is host-specific and must stay in the CLI.
  - `OcrWordPosition` is a converter type, not a CLI type.
- Spec mismatch / risk: without decoupling, the package can't build independently and violates the
  "converter browser-safe / AI Node-only / one source of truth" separation the plan calls for.
- Required fix:
  1. New package `paperboy-ai/` (sibling of paperboy-cli), added to root `workspaces`.
  2. Move `providers.ts` verbatim.
  3. Move `ai.ts` and refactor its public functions to be **host-agnostic**: take the resolved
     `apiKey` and an `AiConfig` subset (`{ mode, baseUrl, model }`) as parameters instead of
     importing CLI `config`/`getApiKey`. Import `OcrWordPosition` from the converter via
     `import type` (no runtime coupling).
  4. Rewire CLI consumers to import from `@proticom/paperboy-ai` and pass the resolved apiKey +
     `config.ai` in. Keep `getApiKey` in the CLI.
  5. Delete the moved files from `paperboy-cli/src`.
- Code sample / exact change (the critical decoupling — shapes, not full bodies):
```ts
// paperboy-ai/src/ai.ts  (was cli/src/ai.ts) — host-agnostic params
import type { OcrWordPosition } from "@proticom/paperboy-converter";
import { getProvider, type ProviderId } from "./providers.js";

export interface AiConfig { mode: string; baseUrl?: string; model?: string; }

export interface DescribeImageParams {
  aiConfig: AiConfig;          // was: config: PaperboyCliConfig
  apiKey: string;              // resolved by the caller (CLI keychain/env)
  providerId: ProviderId;
  ocrText: string;
  words: OcrWordPosition[];
  // ...existing image fields...
}

export async function describeImageWithAi(params: DescribeImageParams): Promise<string | null> {
  const { aiConfig } = params;
  switch (aiConfig.mode) { /* ...unchanged dispatch, using params.apiKey + aiConfig... */ }
}
export async function fetchOpenRouterModels(limit = 15) { /* unchanged — already standalone */ }
```
```ts
// paperboy-cli/src/cli.ts — resolve apiKey in the CLI, pass it in
import { describeImageWithAi } from "@proticom/paperboy-ai";
import { getApiKey } from "./config.js";
// ...
const apiKey = getApiKey(getProvider(config.ai.provider).envVar ?? "");
await describeImageWithAi({ aiConfig: config.ai, apiKey, providerId: config.ai.provider, ocrText, words, /* ... */ });
```
```ts
// paperboy-cli/src/config.ts & setup.ts — import providers/ai from the package, not local files
import { PROVIDERS, type ProviderId } from "@proticom/paperboy-ai";
import { fetchOpenRouterModels } from "@proticom/paperboy-ai";
```
- Validation:
```
ls paperboy-ai/package.json paperboy-ai/src/{ai,providers,index}.ts
grep -rn "paperboy-cli" paperboy-ai/src   # MUST be empty (no backwards dep on the CLI)
grep -rn "from \"./ai\|from \"./providers" paperboy-cli/src   # MUST be empty (moved out)
npm run build  --workspaces --if-present
npm run typecheck --workspaces --if-present
npm test --workspaces --if-present         # cli tests still green after rewiring
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: create `@proticom/paperboy-ai` as the single source of truth for AI providers + image
description, with NO dependency on the CLI; rewire the CLI to consume it.

Files to edit / create:
- create `paperboy-ai/package.json` (model on converter: name `@proticom/paperboy-ai`, version
  `0.2.1`, type module, main `dist/index.js`, types `dist/index.d.ts`, scripts build/test/typecheck,
  license MIT, repository directory `paperboy-ai`, homepage, keywords, files `["dist","README.md","LICENSE"]`),
  `paperboy-ai/tsconfig.json` (mirror cli/converter), `paperboy-ai/LICENSE` (copy converter's),
  `paperboy-ai/README.md`, `paperboy-ai/src/index.ts` (re-export providers + ai public API).
- move `paperboy-cli/src/providers.ts` → `paperboy-ai/src/providers.ts` (verbatim).
- move `paperboy-cli/src/ai.ts` → `paperboy-ai/src/ai.ts` AND decouple per Finding 1 (params for
  apiKey + AiConfig; `import type { OcrWordPosition } from "@proticom/paperboy-converter"`).
- root `package.json`: add `"paperboy-ai"` to `workspaces`.
- `paperboy-cli/package.json`: add `"@proticom/paperboy-ai": "*"` (workspace) to dependencies.
- `paperboy-cli/src/{cli.ts,setup.ts,config.ts}`: import providers/ai from `@proticom/paperboy-ai`;
  resolve apiKey via the CLI's `getApiKey` and pass it + `config.ai` into `describeImageWithAi`.
- delete `paperboy-cli/src/ai.ts` and `paperboy-cli/src/providers.ts` after the move.

Files not to edit:
- `paperboy-converter` source (only consumed for the `OcrWordPosition` type, via `import type`).

Data shapes / CLI examples: providers are OpenRouter/OpenAI/Anthropic/xAI/Ollama/local-endpoint
(keep `PROVIDERS`, `getProvider`, `listProvidersForSetup`, `ProviderId`, `ProviderInfo`).

Tests to add or update: add `paperboy-ai/tests/` — at minimum `providers.test.ts` (getProvider /
listProvidersForSetup) and an `ai.test.ts` that mocks `fetch` and asserts `describeImageWithAi`
dispatches by `aiConfig.mode` and returns null when `mode==="disabled"`. Keep the CLI's existing
vitest suite green after rewiring.

Commands to run:
- `npm install` (link the new workspace + update root lockfile)
- `npm run build --workspaces --if-present`
- `npm run typecheck --workspaces --if-present`
- `npm test --workspaces --if-present`
- the two `grep` guards in Validation (no backwards/stale imports)

Definition of done:
- `@proticom/paperboy-ai` builds, type-checks, and tests independently; it imports nothing from
  `paperboy-cli`.
- The CLI imports AI/providers only from `@proticom/paperboy-ai`; `paperboy-cli/src/{ai,providers}.ts`
  are gone; CLI tests pass.
- Root `workspaces` includes `paperboy-ai`; lockfile updated.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A blockers; the required finding has a full fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- `OcrWordPosition` source: I recommend `import type` from `@proticom/paperboy-converter` (zero
  runtime coupling). If you'd rather not have paperboy-ai reference the converter at all, define a
  minimal local `OcrWordPosition` type in paperboy-ai instead — reply with your choice.

## Decision
send_to_builder
