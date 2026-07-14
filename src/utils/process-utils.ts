import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ProcessSnapshot {
  running: boolean;
  pids: number[];
}

function ensureWindows(): void {
  if (process.platform !== 'win32') {
    throw new Error('Este projeto foi desenhado para Windows.');
  }
}

function parseTasklistCsvLine(line: string): { imageName: string; pid: number } | null {
  const match = line.match(/^"(?<name>[^"]+)","(?<pid>\d+)"/);
  if (!match?.groups) {
    return null;
  }
  return {
    imageName: match.groups.name,
    pid: Number(match.groups.pid),
  };
}

export async function getProcessSnapshot(processName: string): Promise<ProcessSnapshot> {
  ensureWindows();
  const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${processName}`, '/FO', 'CSV', '/NH'], {
    windowsHide: true,
  });

  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  const entries = lines
    .map((line) => parseTasklistCsvLine(line))
    .filter((item): item is { imageName: string; pid: number } => item !== null && item.imageName === processName);

  return {
    running: entries.length > 0,
    pids: entries.map((entry) => entry.pid),
  };
}

export async function isProcessRunning(processName: string): Promise<boolean> {
  const snapshot = await getProcessSnapshot(processName);
  return snapshot.running;
}

export async function killProcessByPid(pid: number, force: boolean): Promise<void> {
  ensureWindows();
  const args = ['/PID', String(pid), '/T'];
  if (force) {
    args.push('/F');
  }
  await execFileAsync('taskkill', args, { windowsHide: true });
}

export async function killProcessByName(processName: string, force: boolean): Promise<void> {
  ensureWindows();
  const args = ['/IM', processName, '/T'];
  if (force) {
    args.push('/F');
  }
  await execFileAsync('taskkill', args, { windowsHide: true });
}
