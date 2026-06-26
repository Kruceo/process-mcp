# process-mcp

A local MCP (Model Context Protocol) server for managing background processes.

`process-mcp` lets AI assistants and other MCP clients start, stop, monitor, and query long-running shell commands without blocking the conversation. Instead of waiting for a command to finish, clients can start it in the background and receive a notification when it exits.

## Features

- Start background processes with custom arguments, working directory, and environment variables
- Stop processes gracefully with SIGTERM or forcefully with SIGKILL
- Query real-time status and retrieve recent log output
- List all managed processes and resolve their system PIDs
- Receive `process/exit` notifications when a background process terminates
- Short, friendly process IDs via `nanoid` (6 characters)
- Strict input validation with `zod`
- Runs over stdio — no HTTP or SSE ports required

## Installation

Requires [Bun](https://bun.sh/).

```bash
bun install
bun run build
```

To run the server directly during development:

```bash
bun run dev
```

To run the compiled server:

```bash
bun run start
```

## Configuration

Add `process-mcp` to your MCP client configuration. For opencode, edit `~/.config/opencode/opencode.json`:

```json
{
  "mcpServers": {
    "process-mcp": {
      "command": "bun",
      "args": [
        "run",
        "/path/to/process-mcp/dist/index.js"
      ]
    }
  }
}
```

> Adjust the absolute path to match your local clone location.

## Tools Reference

### `start`

Start a background process.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `command` | string | yes | Executable or command to run |
| `args` | string[] | no | Arguments passed to the command |
| `cwd` | string | no | Working directory for the process |
| `env` | record | no | Extra environment variables |
| `notifyOnExit` | boolean | no | Send a `process/exit` notification when the process ends |

**Example response:**

```json
{
  "id": "a1b2c3",
  "pid": 12345,
  "status": "running"
}
```

### `stop`

Stop a managed process.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | yes | Process ID returned by `start` |
| `force` | boolean | no | Use SIGKILL instead of SIGTERM (default: `false`) |

**Example response:**

```json
{
  "id": "a1b2c3",
  "pid": 12345,
  "status": "stopped"
}
```

### `get-status`

Get the current status of a process.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | yes | Process ID |

**Returns:** `"running" | "stopped" | "exited" | "crashed" | "not-exists"`

### `get-log`

Retrieve the stdout/stderr log of a process.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | yes | Process ID |
| `lastLines` | number | no | Number of recent log lines to return |

**Example response:**

```json
{
  "lines": [
    "Build started...",
    "Compiled 42 files",
    "Build finished"
  ]
}
```

### `list`

List all managed processes.

**Parameters:** none

**Example response:**

```json
{
  "processes": [
    { "id": "a1b2c3", "pid": 12345, "status": "running" },
    { "id": "d4e5f6", "pid": null, "status": "exited" }
  ]
}
```

### `get-pid`

Get the system PID of a managed process.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | yes | Process ID |

**Returns:** PID number or `null`

## Notification

When a process is started with `notifyOnExit: true`, the server sends a `process/exit` notification once the process terminates. The notification payload includes the process ID and final status.

This allows clients such as opencode to resume a conversation after a long-running task completes, without polling for status.

## Development

Run the test suite:

```bash
bun test
```

Build the project:

```bash
bun run build
```

Run the server from source:

```bash
bun run dev
```

## License

MIT
