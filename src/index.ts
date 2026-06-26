import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ProcessManager } from "./process-manager.js";
import type { ProcessInfo } from "./types.js";

const server = new Server(
  {
    name: "process-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const transport = new StdioServerTransport();

// Global process manager used by the MCP server tools (Fase 3).
export const processManager = new ProcessManager({
  onExit: async (info) => {
    if (!info.notifyOnExit) return;

    await server.notification({
      method: "process/exit",
      params: {
        id: info.id,
        status: info.status,
        exitCode: info.exitCode ?? null,
        timestamp: new Date().toISOString(),
      },
    });
  },
});

async function shutdown(signal: string): Promise<void> {
  console.error(`Received ${signal}, shutting down gracefully...`);
  await processManager.shutdown();
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const startSchema = z.object({
  command: z.string().min(1).describe("Command to execute"),
  args: z
    .array(z.string())
    .optional()
    .describe("Arguments to pass to the command"),
  cwd: z.string().optional().describe("Working directory for the process"),
  env: z
    .record(z.string())
    .optional()
    .describe("Environment variables to set for the process"),
  notifyOnExit: z
    .boolean()
    .optional()
    .describe("Whether to send a notification when the process exits"),
});

const stopSchema = z.object({
  id: z.string().min(1).describe("Process ID"),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe("Force kill the process"),
});

const idSchema = z.object({
  id: z.string().min(1).describe("Process ID"),
});

const getLogSchema = z.object({
  id: z.string().min(1).describe("Process ID"),
  lastLines: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Number of last log lines to return"),
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "start",
      description: "Start a new managed process",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Command to execute",
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Arguments to pass to the command",
          },
          cwd: {
            type: "string",
            description: "Working directory for the process",
          },
          env: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Environment variables to set for the process",
          },
          notifyOnExit: {
            type: "boolean",
            description: "Whether to send a notification when the process exits",
          },
        },
        required: ["command"],
      },
    },
    {
      name: "stop",
      description: "Stop a managed process",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Process ID",
          },
          force: {
            type: "boolean",
            description: "Force kill the process",
            default: false,
          },
        },
        required: ["id"],
      },
    },
    {
      name: "get-status",
      description: "Get the status of a managed process",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Process ID",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "get-log",
      description: "Get the logs of a managed process",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Process ID",
          },
          lastLines: {
            type: "number",
            description: "Number of last log lines to return",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "list",
      description: "List all managed processes",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get-pid",
      description: "Get the PID of a managed process",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Process ID",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "remove",
      description:
        "Remove a stopped or exited process from the managed list. Running processes cannot be removed.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Process ID",
          },
        },
        required: ["id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "start": {
        const parsed = startSchema.parse(args);
        const info = processManager.start(parsed.command, parsed.args ?? [], {
          cwd: parsed.cwd,
          env: parsed.env,
          notifyOnExit: parsed.notifyOnExit,
        });

        return {
          content: [
            {
              type: "text",
              text: formatStartResult(info),
            },
          ],
        };
      }

      case "stop": {
        const parsed = stopSchema.parse(args);
        const info = processManager.stop(parsed.id, parsed.force);

        if (!info) {
          return {
            content: [
              {
                type: "text",
                text: `Process with id "${parsed.id}" not found`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: formatStopResult(info),
            },
          ],
        };
      }

      case "get-status": {
        const parsed = idSchema.parse(args);
        const status = processManager.getStatus(parsed.id);

        return {
          content: [
            {
              type: "text",
              text: `Process "${parsed.id}" status: ${status}`,
            },
          ],
        };
      }

      case "get-log": {
        const parsed = getLogSchema.parse(args);
        const logs = processManager.getLog(parsed.id, parsed.lastLines);

        if (logs === null) {
          return {
            content: [
              {
                type: "text",
                text: `Process with id "${parsed.id}" not found`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: formatLogResult(parsed.id, logs),
            },
          ],
        };
      }

      case "list": {
        const processes = processManager.list();

        return {
          content: [
            {
              type: "text",
              text: formatListResult(processes),
            },
          ],
        };
      }

      case "get-pid": {
        const parsed = idSchema.parse(args);
        const pid = processManager.getPid(parsed.id);

        return {
          content: [
            {
              type: "text",
              text: `Process "${parsed.id}" PID: ${pid ?? "null"}`,
            },
          ],
        };
      }

      case "remove": {
        const parsed = idSchema.parse(args);
        const info = processManager.remove(parsed.id);

        if (!info) {
          return {
            content: [
              {
                type: "text",
                text: `Process "${parsed.id}" not found or still running`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Process "${info.id}" removed (was: ${info.status})`,
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return {
        content: [
          {
            type: "text",
            text: `Invalid input: ${issues}`,
          },
        ],
        isError: true,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

function formatStartResult(info: ProcessInfo): string {
  const lines = [
    "Process started:",
    `- ID: ${info.id}`,
    `- Command: ${info.command}`,
    `- Args: ${JSON.stringify(info.args)}`,
    `- PID: ${info.pid ?? "null"}`,
    `- Status: ${info.status}`,
    `- Notify on exit: ${info.notifyOnExit ?? false}`,
  ];

  return lines.join("\n");
}

function formatStopResult(info: ProcessInfo): string {
  const lines = [
    `Process "${info.id}" stopped:`,
    `- Status: ${info.status}`,
  ];

  if (info.exitCode !== undefined) {
    lines.push(`- Exit code: ${info.exitCode ?? "null"}`);
  }

  if (info.stoppedAt) {
    lines.push(`- Stopped at: ${info.stoppedAt.toISOString()}`);
  }

  return lines.join("\n");
}

function formatLogResult(id: string, logs: string[]): string {
  if (logs.length === 0) {
    return `Process "${id}" has no logs.`;
  }

  const header = `Process "${id}" logs (${logs.length} lines):`;
  return [header, ...logs].join("\n");
}

function formatListResult(processes: ProcessInfo[]): string {
  if (processes.length === 0) {
    return "No managed processes.";
  }

  const lines = [
    `Managed processes (${processes.length}):`,
    ...processes.map((info) => {
      const pid = info.pid ?? "null";
      const args = JSON.stringify(info.args);
      return `- ${info.id}: ${info.command} ${args} (status: ${info.status}, pid: ${pid}, startedAt: ${info.startedAt.toISOString()})`;
    }),
  ];

  return lines.join("\n");
}

async function main(): Promise<void> {
  await server.connect(transport);
  console.error("process-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
