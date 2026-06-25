import { nanoid } from "nanoid";
import type { ProcessId, ProcessInfo, ProcessStatus } from "./types.js";

export class ProcessManager {
  private processes = new Map<ProcessId, ProcessInfo>();

  start(command: string, args: string[] = []): ProcessInfo {
    const id: ProcessId = nanoid(6);

    const info: ProcessInfo = {
      id,
      command,
      args,
      status: "running" as ProcessStatus,
      pid: undefined,
      startedAt: new Date(),
      logs: [],
    };

    this.processes.set(id, info);
    return info;
  }

  stop(id: ProcessId): ProcessInfo | null {
    const info = this.processes.get(id);
    if (!info) return null;

    info.status = "stopped";
    return info;
  }

  getStatus(id: ProcessId): ProcessInfo | null {
    return this.processes.get(id) ?? null;
  }

  getLogs(id: ProcessId): string[] {
    return this.processes.get(id)?.logs ?? [];
  }
}
