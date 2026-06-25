import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ProcessManager } from "./process-manager.js";

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
export const processManager = new ProcessManager();

async function shutdown(signal: string): Promise<void> {
  console.error(`Received ${signal}, shutting down gracefully...`);
  processManager.stopAll();
  // Give child processes a short window to terminate before exiting.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function main(): Promise<void> {
  await server.connect(transport);
  console.error("process-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
