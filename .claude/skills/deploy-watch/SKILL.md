---
name: deploy-watch
description: After a push to paperboy-site/master, poll Vercel for the latest deployment of paperboy.run and report ready/error. Tightens the "git push → wait → did it deploy?" loop into a single command.
disable-model-invocation: true
---

# Watch the latest paperboy.run deploy

Use this skill right after running `git push origin master` in `paperboy-site/`. It uses the Anthropic-integrated Vercel MCP tools (`mcp__claude_ai_Vercel__*`) to find the deployment that the push triggered, polls it until terminal state, and reports back.

## Steps

1. **Find the project.** Call `mcp__claude_ai_Vercel__list_projects` and locate the project for `paperboy.run` (production domain `paperboy.run`). Note its `projectId` and the team it belongs to.
2. **Get the latest deployment.** Call `mcp__claude_ai_Vercel__list_deployments` with that project, sort by `createdAt` desc, take the first one.
3. **Poll until terminal.** Vercel deployment states: `QUEUED → BUILDING → READY` (success) or `ERROR` / `CANCELED` (failure). Re-call `mcp__claude_ai_Vercel__get_deployment` every ~15 seconds until state is `READY`, `ERROR`, or `CANCELED`. Cap at 10 minutes.
4. **Report.**
   - On READY: print the production URL (paperboy.run) and how long the build took.
   - On ERROR: pull the build log via `mcp__claude_ai_Vercel__get_deployment_build_logs` and surface the last 40 lines so we can see what failed.
   - On CANCELED: just note it (a newer deploy superseded this one).

## What not to do

- Don't trigger a new deploy. This skill only watches; pushing is the user's call.
- Don't poll faster than ~10s — Vercel rate-limits and faster polling won't get answers any faster.

## When this is useful

- After every site `git push` to master.
- When the user asks "is the site live yet?" or "did my push deploy?".
