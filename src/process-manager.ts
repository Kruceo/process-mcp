import { nanoid } from "nanoid";
import type { ChildProcess } from "node:child_process";
import { spawn as nodeSpawn } from "node:child_process";
import type {
  ProcessExitCallback,
  ProcessId,
  ProcessInfo,
  ProcessManagerOptions,
  ProcessStatus,
  StartProcessOptions,
} from "./types.js";

const MAX_LOG_LINES = 1000;
const SIGTERM_TIMEOUT_MS = 5000;

interface ManagedProcess extends ProcessInfo {
  _proc: Bun.Subprocess | ChildProcess | null;
  _killed: boolean;
}


export class ProcessManager {
  private processes = new Map<ProcessId, ManagedProcess>();
  private onExit?: (info: ProcessInfo) => void | Promise<void>;

  constructor(options?: ProcessManagerOptions) {
    this.onExit = options?.onExit;
  }

  start(
    command: string,
    args: string[] = [],
    options: StartProcessOptions = {}
  ): ProcessInfo {
    const id: ProcessId = nanoid(6);
    const env = options.env
      ? { ...process.env, ...options.env }
      : { ...process.env };

    const baseInfo: ProcessInfo = {
      id,
      command,
      args,
      status: "running" as ProcessStatus,
      pid: undefined,
      exitCode: undefined,
      startedAt: new Date(),
      stoppedAt: undefined,
      logs: [],
      notifyOnExit: options.notifyOnExit ?? false,
    };

    let subprocess: Bun.Subprocess | ChildProcess;

    try {
      if (typeof Bun !== "undefined" && Bun.spawn) {
        subprocess = Bun.spawn([command, ...args], {
          cwd: options.cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          onExit: (_proc, exitCode, signalCode) => {
            this.handleExit(id, exitCode ?? null, signalCode ?? null);
          },
        });

        const stdoutReader = subprocess.stdout?.getReader();
        const stderrReader = subprocess.stderr?.getReader();

        if (stdoutReader) {
          this.pumpReader(id, stdoutReader);
        }
        if (stderrReader) {
          this.pumpReader(id, stderrReader);
        }
      } else {
        subprocess = nodeSpawn(command, args, {
          cwd: options.cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          detached: false,
        });

        subprocess.stdout?.on("data", (chunk: Buffer) => {
          this.appendLogLines(id, chunk.toString("utf-8"));
        });

        subprocess.stderr?.on("data", (chunk: Buffer) => {
          this.appendLogLines(id, chunk.toString("utf-8"));
        });

        subprocess.on("exit", (exitCode, signalCode) => {
          this.handleExit(id, exitCode ?? null, signalCode ?? null);
        });

        subprocess.unref();
        subprocess.stdout?.unref?.();
        subprocess.stderr?.unref?.();
      }
    } catch (error) {
      const failedInfo: ProcessInfo = {
        ...baseInfo,
        status: "crashed" as ProcessStatus,
        exitCode: null,
        stoppedAt: new Date(),
      };
      this.processes.set(id, failedInfo as ManagedProcess);
      return failedInfo;
    }

    const managed: ManagedProcess = {
      ...baseInfo,
      pid: subprocess.pid,
      _proc: subprocess,
      _killed: false,
    };

    this.processes.set(id, managed);
    return managed;
  }

  stop(id: ProcessId, force = false): ProcessInfo | null {
    const info = this.processes.get(id);
    if (!info) return null;

    if (info.status !== "running") {
      return { ...info };
    }

    const pid = info.pid;
    if (!pid) return { ...info };

    if (force) {
      this.killForcefully(id, pid);
    } else {
      this.killGracefully(id, pid);
    }

    return { ...info };
  }

  getStatus(id: ProcessId): ProcessStatus | "not-exists" {
    const info = this.processes.get(id);
    if (!info) return "not-exists";

    if (info.status === "running" && info._killed) {
      return "stopped";
    }

    return info.status;
  }

  getLog(id: ProcessId, lastLines?: number): string[] | null {
    const info = this.processes.get(id);
    if (!info) return null;

    const logs = info.logs;
    if (lastLines === undefined || lastLines >= logs.length) {
      return [...logs];
    }
    return logs.slice(-Math.max(0, lastLines));
  }

  list(): ProcessInfo[] {
    return Array.from(this.processes.values()).map((info) => ({
      ...info,
      logs: [...info.logs],
    }));
  }

  getPid(id: ProcessId): number | null {
    return this.processes.get(id)?.pid ?? null;
  }

  remove(id: ProcessId): ProcessInfo | null {
    const info = this.processes.get(id);
    if (!info) return null;

    if (info.status === "running") {
      return null;
    }

    const removed = { ...info, logs: [...info.logs] };
    this.processes.delete(id);
    return removed;
  }

  async shutdown(timeoutMs = 10000): Promise<void> {
    const running: Promise<void>[] = [];

    for (const [id, info] of this.processes.entries()) {
      if (info.status === "running" && info.pid) {
        this.killGracefully(id, info.pid);

        running.push(
          new Promise<void>((resolve) => {
            const check = () => {
              const current = this.processes.get(id);
              if (!current || current.status !== "running") {
                resolve();
                return;
              }
              setTimeout(check, 50);
            };
            check();
            setTimeout(resolve, timeoutMs);
          })
        );
      }
    }

    await Promise.all(running);
  }

  private pumpReader(
    id: ProcessId,
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): void {
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const read = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            this.appendLogLine(id, line);
          }
        }

        if (buffer.length > 0) {
          this.appendLogLine(id, buffer);
        }
      } catch {
        // Ignore read errors after process exit.
      } finally {
        reader.releaseLock();
      }
    };

    read();
  }

  private appendLogLines(id: ProcessId, chunk: string): void {
    const lines = chunk.split("\n");
    for (const line of lines) {
      this.appendLogLine(id, line);
    }
  }

  private appendLogLine(id: ProcessId, line: string): void {
    const info = this.processes.get(id);
    if (!info) return;

    info.logs.push(line);
    if (info.logs.length > MAX_LOG_LINES) {
      info.logs.shift();
    }
  }

  private handleExit(
    id: ProcessId,
    exitCode: number | null,
    signalCode: string | number | null
  ): void {
    const info = this.processes.get(id);
    if (!info) return;

    info.exitCode = exitCode;
    if (info.status === "running") {
      info.status = info._killed ? "stopped" : "exited";
    }
    info.stoppedAt = new Date();

    // Release the subprocess handle to allow GC.
    info._proc = null as any;

    this.onExit?.(info);
  }

  private killGracefully(id: ProcessId, pid: number): void {
    const info = this.processes.get(id);
    if (!info || info._killed) return;

    info._killed = true;

    try {
      if (process.platform === "win32") {
        nodeSpawn("taskkill", ["/T", "/PID", String(pid)], { stdio: "ignore" });
      } else {
        process.kill(pid, "SIGTERM");
      }
    } catch {
      // Process may have already exited.
    }

    setTimeout(() => {
      const current = this.processes.get(id);
      if (current?._killed && current.status === "running") {
        this.killForcefully(id, pid);
      }
    }, SIGTERM_TIMEOUT_MS);
  }

  private killForcefully(id: ProcessId, pid: number): void {
    const info = this.processes.get(id);
    if (!info) return;

    info._killed = true;

    try {
      if (process.platform === "win32") {
        nodeSpawn("taskkill", ["/F", "/PID", String(pid)], { stdio: "ignore" });
      } else {
        process.kill(pid, "SIGKILL");
      }
    } catch {
      // Process may have already exited.
    }
  }
}
