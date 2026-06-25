import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ProcessManager } from "../src/process-manager";

const isWindows = process.platform === "win32";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStatus(
  manager: ProcessManager,
  id: string,
  status: "running" | "stopped" | "exited" | "not-exists" | "crashed",
  timeoutMs = 5000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (manager.getStatus(id) === status) return true;
    await sleep(50);
  }
  return false;
}

async function waitForTerminalStatus(
  manager: ProcessManager,
  id: string,
  timeoutMs = 5000
): Promise<boolean> {
  const terminalStatuses: Array<"exited" | "stopped" | "crashed"> = [
    "exited",
    "stopped",
    "crashed",
  ];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = manager.getStatus(id);
    if (terminalStatuses.includes(status as any)) return true;
    await sleep(50);
  }
  return false;
}

describe("ProcessManager", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager();
  });

  afterEach(async () => {
    for (const info of manager.list()) {
      if (info.status === "running") {
        manager.stop(info.id, true);
      }
    }
    await sleep(100);
  });

  it("should be defined and create an instance", () => {
    expect(ProcessManager).toBeDefined();
    expect(manager).toBeInstanceOf(ProcessManager);
  });

  it("should start a simple process and return ProcessInfo", () => {
    const info = manager.start("bun", ["-e", "console.log('hello')"]);

    expect(info.id).toBeString();
    expect(info.id.length).toBe(6);
    expect(info.command).toBe("bun");
    expect(info.args).toEqual(["-e", "console.log('hello')"]);
    expect(info.status).toBe("running");
    expect(info.pid).toBeNumber();
    expect(info.pid).toBeGreaterThan(0);
    expect(info.startedAt).toBeInstanceOf(Date);
    expect(info.logs).toEqual([]);
  });

  it("should capture stdout/stderr logs", async () => {
    const info = manager.start("bun", [
      "-e",
      "console.log('hello'); console.error('world');",
    ]);

    const reached = await waitForStatus(manager, info.id, "exited", 5000);
    expect(reached).toBe(true);

    const logs = manager.getLog(info.id);
    expect(logs).toBeArray();
    expect(logs!.length).toBeGreaterThanOrEqual(1);
    const joined = logs!.join("\n");
    expect(joined).toContain("hello");
    expect(joined).toContain("world");
  });

  it("should transition from running to exited", async () => {
    const info = manager.start("bun", ["-e", "console.log('done')"]);
    expect(manager.getStatus(info.id)).toBe("running");

    const reached = await waitForStatus(manager, info.id, "exited", 5000);
    expect(reached).toBe(true);

    const updated = manager.list().find((p) => p.id === info.id);
    expect(updated?.status).toBe("exited");
    expect(updated?.exitCode).toBe(0);
    expect(updated?.stoppedAt).toBeInstanceOf(Date);
  });

  it("should stop a running process with SIGTERM (force=false)", async () => {
    const info = manager.start("bun", [
      "-e",
      "setInterval(() => {}, 1000)",
    ]);
    expect(manager.getStatus(info.id)).toBe("running");

    const stopped = manager.stop(info.id, false);
    expect(stopped).not.toBeNull();

    const reached = await waitForStatus(manager, info.id, "stopped", 7000);
    expect(reached).toBe(true);
  });

  it("should stop a running process with SIGKILL (force=true)", async () => {
    const info = manager.start("bun", [
      "-e",
      "setInterval(() => {}, 1000)",
    ]);
    expect(manager.getStatus(info.id)).toBe("running");

    const stopped = manager.stop(info.id, true);
    expect(stopped).not.toBeNull();

    const reached = await waitForStatus(manager, info.id, "stopped", 5000);
    expect(reached).toBe(true);
  });

  it("should list all managed processes", () => {
    const info1 = manager.start("bun", ["-e", "console.log('a')"]);
    const info2 = manager.start("bun", ["-e", "console.log('b')"]);

    const list = manager.list();
    expect(list.length).toBe(2);
    expect(list.map((p) => p.id)).toContain(info1.id);
    expect(list.map((p) => p.id)).toContain(info2.id);
  });

  it("should return a valid PID", () => {
    const info = manager.start("bun", ["-e", "console.log('pid')"]);
    const pid = manager.getPid(info.id);

    expect(pid).toBeNumber();
    expect(pid).toBeGreaterThan(0);
    expect(pid).toBe(info.pid);
  });

  it("should return null for unknown ids", () => {
    expect(manager.getStatus("unknown")).toBe("not-exists");
    expect(manager.getLog("unknown")).toBeNull();
    expect(manager.stop("unknown")).toBeNull();
    expect(manager.getPid("unknown")).toBeNull();
  });

  it("should handle invalid commands gracefully", async () => {
    const info = manager.start("this-command-definitely-does-not-exist-12345");

    const reached = await waitForTerminalStatus(manager, info.id, 5000);
    expect(reached).toBe(true);

    const updated = manager.list().find((p) => p.id === info.id);
    expect(["exited", "crashed"]).toContain(updated?.status);
  });

  it("should limit log buffer to 1000 lines", async () => {
    const info = manager.start("bun", [
      "-e",
      "for (let i = 1; i <= 1100; i++) console.log('line-' + i)",
    ]);

    const reached = await waitForStatus(manager, info.id, "exited", 10000);
    expect(reached).toBe(true);

    const logs = manager.getLog(info.id);
    expect(logs!.length).toBeLessThanOrEqual(1000);
    expect(logs!.join("\n")).toContain("line-1100");
  });

  it("should return the last N log lines when requested", async () => {
    const info = manager.start("bun", [
      "-e",
      "for (let i = 1; i <= 10; i++) console.log('line-' + i)",
    ]);

    const reached = await waitForStatus(manager, info.id, "exited", 5000);
    expect(reached).toBe(true);

    const last3 = manager.getLog(info.id, 3);
    expect(last3!.length).toBe(3);
    expect(last3![0]).toContain("line-8");
    expect(last3![1]).toContain("line-9");
    expect(last3![2]).toContain("line-10");
  });

  it("should store notifyOnExit flag in ProcessInfo", () => {
    const info = manager.start("bun", ["-e", "console.log('notify')"], {
      notifyOnExit: true,
    });
    expect(info.notifyOnExit).toBe(true);
  });
});
