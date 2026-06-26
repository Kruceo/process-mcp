# AGENTS.md — Process MCP Server

Local MCP server for managing background processes. Start, stop, monitor, and query long-running commands without blocking the conversation.

## Key Decisions

- **Bun-first.** Runtime is Bun. Node compatibility is nice-to-have, not a requirement.
- **MCP via stdio.** No HTTP/SSE ports. The server communicates strictly via stdin/stdout.
- **IDs are short.** `nanoid(6)` — ex: `aB3xK9`. No UUIDs.
- **Logs capped at 1000 lines.** Circular buffer per process.
- **Signals: SIGTERM → SIGKILL.** `stop(id, false)` sends SIGTERM, `stop(id, true)` sends SIGKILL. On Windows, uses `taskkill /T` for process tree termination.
- **notifyOnExit.** When `true`, the server emits a `process/exit` MCP notification when the process terminates. No client currently resumes conversations from this, but the infrastructure is ready.
- **No clean architecture.** Keep it simple, practical, and reliable.

## Commit Conventions (Pipoca-Style)

We use semantic commits to drive automatic versioning via [pipoca](https://github.com/kruceo/pipoca).

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

## Versioning

```bash
bunx pipoca update package.json   # calculate next version from commits
git tag v$(jq -r .version package.json)
git push origin main --tags
```

## Quality Gates

- `bun test` passes
- `bun run build` compiles without errors
- Commit messages follow semantic conventions