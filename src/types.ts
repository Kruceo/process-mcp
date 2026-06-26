export type ProcessId = string;

export type ProcessStatus =
  | "running"
  | "stopped"
  | "exited"
  | "crashed"
  | "not-exists";

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
  notifyOnExit?: boolean;
}

export interface StartProcessOptions {
  cwd?: string;
  env?: Record<string, string>;
  notifyOnExit?: boolean;
}

export interface ProcessExitNotification {
  id: ProcessId;
  status: ProcessStatus;
  exitCode: number | null;
  timestamp: string;
}

export type ProcessExitCallback = (info: ProcessInfo) => void | Promise<void>;

export interface ProcessManagerOptions {
  onExit?: ProcessExitCallback;
}
