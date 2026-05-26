# 3.4 - Review Turn 1

## Task Context
- Task id: 3.4
- Task title: Cut converter v0.2.2 tag and verify npm publish
- Dashboard implementation status: in_progress → (review outcome: needs_human)
- Review status: in_review → needs_human
- Spec sections: Phase 3 item **3.4** ("Cut converter v0.2.2 tag → watch the publish workflow run
  end-to-end → verify with `npm view @proticom/paperboy-converter@0.2.2`. Use the existing
  release-cut skill.")
- Files inspected:
  - `.github/workflows/publish-paperboy-converter.yml` (the workflow that will run on the tag)
  - `.claude/skills/release-cut/SKILL.md`, `.claude/skills/bump-version/SKILL.md` (the tools)
  - `.claude/skills/npm-trusted-publisher/SKILL.md` (the prerequisite, from 3.3)
- Commands run:
  - reviewed the converter publish workflow + release skills
- Current claim being verified: a real `v0.2.2` tag was cut and `@proticom/paperboy-converter@0.2.2`
  is live on npm.

## Findings

### Finding 1: this is a live operational release action — not agent-reviewable code, and gated on a manual prerequisite
- Severity: blocker (for the agent loop)
- Location: operational (git tag push to `github.com/proticom/paperboy`, GitHub Actions run, npm registry)
- Problem: 3.4 is not a code/config/doc change the builder can author or the reviewer can verify
  locally. It requires: (a) the npm Trusted Publisher setup from 3.3 to be **done on npm.com**
  (still outstanding — a manual user action); (b) bumping to `0.2.2` and pushing a real `v0.2.2`
  tag to the GitHub remote; (c) the live `publish-paperboy-converter.yml` Actions run; (d) the
  package actually appearing on npm. None of (a)–(d) can be performed by the local builder or
  confirmed by the reviewer in this sandbox.
- Spec mismatch / risk: marking it review_passed would be false (nothing published). Sending it to
  the builder is pointless (there is no local artifact to produce). The correct state is
  `needs_human` so the queue pauses for the operator.
- Required fix (human runbook, only Edward can do this):
  1. Complete the npm Trusted Publisher setup per `.claude/skills/npm-trusted-publisher/SKILL.md`.
  2. Bump versions to `0.2.2` (use the `bump-version` skill) and commit.
  3. Cut + push the converter tag (use the `release-cut` skill).
  4. Watch the `publish-paperboy-converter.yml` run to green.
  5. Verify the publish.
- Code sample / exact change (operator commands, run by Edward):
```bash
# after npm Trusted Publisher setup is configured on npmjs.com:
#   bump all workspace packages to 0.2.2 (bump-version skill), commit, then:
git tag v0.2.2
git push origin v0.2.2
# watch the Actions run: https://github.com/proticom/paperboy/actions
```
- Validation:
```bash
npm view @proticom/paperboy-converter@0.2.2   # should show version 0.2.2 + dist-tags.latest
```

## Builder Prompt

Developer/Builder: no action. 3.4 is a live release operation, not a local build/review task.

This task is handed to the human operator (Edward):
- Objective: publish `@proticom/paperboy-converter@0.2.2` via the tag-driven OIDC workflow.
- Files to edit: none in the agent loop (version bump handled by the `bump-version` skill at
  release time).
- Commands to run: the operator runbook above.
- Definition of done: `npm view @proticom/paperboy-converter@0.2.2` shows the published version.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — yes (the operator runbook)
- [x] Every required finding has a validation command — yes (`npm view`)
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- The two-agent build/review loop has reached the operational release boundary. Tasks 3.4, 3.5,
  3.6 (and several Phase 5 items) are live release/operations only the operator can perform; the
  loop cannot produce or verify a local artifact for them. Decision deferred to the human on how to
  proceed (pause for releases vs. reorder to pull buildable code tasks forward).

## Decision
needs_human
