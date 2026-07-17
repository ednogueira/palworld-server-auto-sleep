export interface ProcessSnapshot {
  running: boolean;
  pids: number[];
}

export interface ServerProcessDriver {
  isRunning(): Promise<boolean>;
  getSnapshot(): Promise<ProcessSnapshot>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ServerProcessDriverOptions {
  logger: import('pino').Logger;
}
