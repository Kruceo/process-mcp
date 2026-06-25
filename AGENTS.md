# AGENTS.md — Process MCP Server

## Overview

This document defines the agent architecture, responsibilities, and workflow conventions for the **process-mcp** project. Inspired by [kruceo/pipoca](https://github.com/kruceo/pipoca), we adopt semantic commit conventions and automated versioning to maintain a clean, traceable history.

---

## Agent Roles

### 1. Tech Lead (TL)
- **Responsibility:** Architecture, planning, delegation, and quality gates.
- **Actions:** Creates plans, reviews outputs, delegates to Junior/Code Reviewer.
- **Constraints:** Never writes implementation code directly. Only orchestrates.

### 2. Junior Developer (JD)
- **Responsibility:** Implementation, coding, testing, and documentation.
- **Actions:** Writes code, runs tests, fixes bugs, updates configs.
- **Constraints:** Must follow plans from TL. Cannot merge without review.

### 3. Code Reviewer (CR)
- **Responsibility:** Security, performance, maintainability, and correctness reviews.
- **Actions:** Reviews PRs/code changes, flags issues, suggests improvements.
- **Constraints:** Does not implement fixes — only reports findings.

---

## Workflow

```
User Request
    │
    ▼
Tech Lead ──► Plan / Architecture ──► Delegate to JD or CR
    │                                      │
    │                                      ▼
    │                              Junior Developer
    │                              (Implement / Test)
    │                                      │
    │                                      ▼
    │                              Code Reviewer
    │                              (Review / Flag)
    │                                      │
    └──────────────────────────────────────┘
                    │
                    ▼
              Tech Lead
         (Approve / Iterate)
```

---

## Commit Conventions (Pipoca-Style)

We use **semantic commits** to drive automatic versioning via `pipoca`.

### Commit Tags

| Tag | Meaning | Version Bump |
|-----|---------|--------------|
| `fix:` | Bug fix, correction | **patch** `0.0.x` |
| `style:` | Formatting, linting, no logic change | **patch** `0.0.x` |
| `docs:` | Documentation updates | **patch** `0.0.x` |
| `refactor:` | Code restructuring, no feature change | **patch** `0.0.x` |
| `test:` | Adding or updating tests | **patch** `0.0.x` |
| `feature:` | New functionality | **minor** `0.x.0` |
| `update:` | Dependency updates, enhancements | **minor** `0.x.0` |
| `release:` | Major milestone, breaking changes | **major** `x.0.0` |
| `chore:` | Maintenance, build, CI changes | **none** |

### Examples

```bash
fix: handle SIGTERM gracefully on Windows
feature: add notifyOnExit parameter to start tool
docs: update README with installation steps
release: v1.0.0 stable API
```

---

## Versioning Strategy

- **Tool:** `pipoca` (via `npx pipoca`)
- **File:** `package.json`
- **Trigger:** Manual or CI/CD on push to `main`
- **Flow:**
  1. Developer commits with semantic tags
  2. Before release, run: `npx pipoca update package.json`
  3. Pipoca calculates next version from commit history
  4. Commit version bump: `git add package.json && git commit -m "chore: bump version"`
  5. Tag release: `git tag v$(jq -r .version package.json)`
  6. Push: `git push origin main --tags`

---

## Communication Rules

1. **TL → JD:** Always provide clear, actionable tasks with acceptance criteria.
2. **JD → CR:** Submit code via PR or explicit review request.
3. **CR → JD:** Report issues with severity (blocking / warning / suggestion).
4. **JD → TL:** Escalate blockers immediately. Do not stall.

---

## Quality Gates

Before any code reaches `main`:

- [ ] All tests pass (`bun test`)
- [ ] No TypeScript errors (`bun run build` or `tsc --noEmit`)
- [ ] Code reviewed by CR (or TL if CR unavailable)
- [ ] Commit messages follow semantic conventions
- [ ] Version bumped via `pipoca` (if releasing)

---

## Emergency Overrides

If a critical bug requires immediate fix:

1. JD creates hotfix branch: `git checkout -b hotfix/critical-bug`
2. Fix with `fix:` commit
3. TL fast-tracks review (can skip CR if urgency demands)
4. Merge to `main`, run `pipoca update`, tag patch release

---

## Notes

- Keep it simple. No Clean Architecture. No over-engineering.
- Bun-first. Node compatibility is a nice-to-have, not a requirement.
- MCP server runs strictly via stdio. No HTTP/SSE ports.
- IDs are short (`nanoid(6)`), logs are capped at 1000 lines.
