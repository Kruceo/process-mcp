import { describe, it, expect } from "bun:test";
import { ProcessManager } from "../src/process-manager";

describe("ProcessManager", () => {
  it("should be defined", () => {
    expect(ProcessManager).toBeDefined();
  });

  it("should create an instance", () => {
    const manager = new ProcessManager();
    expect(manager).toBeInstanceOf(ProcessManager);
  });
});
