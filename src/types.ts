export type ProcessId = string;

export type ProcessStatus = "running" | "stopped" | "crashed" | "unknown";

export interface ProcessInfo {
  id: ProcessId;
  command: string;
  args: string[];
  status: ProcessStatus;
  pid?: number;
  exitCode?: number | null;
  startedAt: Date;
  stoppedAt?: Date;
  logs: string[];
}

export interface StartProcessOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  notifyOnExit?: boolean;
}
