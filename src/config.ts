import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface AppConfig {
  palserverExePath: string;
  palserverWorkingDirectory: string;
  palserverArguments: string[];
  palserverProcessName: string;
  gameHost: string;
  gamePort: number;
  restApiHost: string;
  restApiPort: number;
  restApiUsername: string;
  restApiPassword: string;
  playerCheckIntervalSeconds: number;
  emptyServerTimeoutMinutes: number;
  serverStartupTimeoutSeconds: number;
  serverShutdownTimeoutSeconds: number;
  wakeCooldownSeconds: number;
  logLevel: LogLevel;
}

const REQUIRED_KEYS = [
  'PALSERVER_EXE_PATH',
  'PALSERVER_WORKING_DIRECTORY',
  'PALSERVER_PROCESS_NAME',
  'GAME_HOST',
  'GAME_PORT',
  'REST_API_HOST',
  'REST_API_PORT',
  'REST_API_USERNAME',
  'REST_API_PASSWORD',
  'PLAYER_CHECK_INTERVAL_SECONDS',
  'EMPTY_SERVER_TIMEOUT_MINUTES',
  'SERVER_STARTUP_TIMEOUT_SECONDS',
  'SERVER_SHUTDOWN_TIMEOUT_SECONDS',
  'WAKE_COOLDOWN_SECONDS',
  'LOG_LEVEL',
] as const;

function required(value: string | undefined, key: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Variavel de ambiente ausente: ${key}`);
  }
  return trimmed;
}

function parseNumber(value: string | undefined, key: string, options: { min: number; max?: number }): number {
  const raw = required(value, key);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`Valor numerico invalido em ${key}: ${raw}`);
  }
  if (parsed < options.min || (options.max !== undefined && parsed > options.max)) {
    throw new Error(`Valor fora do intervalo em ${key}: ${raw}`);
  }
  return parsed;
}

function parseLogLevel(value: string | undefined): LogLevel {
  const raw = required(value, 'LOG_LEVEL').toLowerCase();
  const allowed: LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
  if (!allowed.includes(raw as LogLevel)) {
    throw new Error(`LOG_LEVEL invalido: ${raw}`);
  }
  return raw as LogLevel;
}

function parseArguments(value: string | undefined): string[] {
  const raw = value?.trim();
  if (!raw) {
    return [];
  }
  return raw.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((item) => item.replace(/^"|"$/g, '')) ?? [];
}

function assertPathExists(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Caminho nao encontrado: ${filePath}`);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  for (const key of REQUIRED_KEYS) {
    required(env[key], key);
  }

  const palserverExePath = required(env.PALSERVER_EXE_PATH, 'PALSERVER_EXE_PATH');
  const palserverWorkingDirectory = required(env.PALSERVER_WORKING_DIRECTORY, 'PALSERVER_WORKING_DIRECTORY');

  if (!path.isAbsolute(palserverExePath)) {
    throw new Error('PALSERVER_EXE_PATH deve ser um caminho absoluto.');
  }
  if (!path.isAbsolute(palserverWorkingDirectory)) {
    throw new Error('PALSERVER_WORKING_DIRECTORY deve ser um caminho absoluto.');
  }

  return {
    palserverExePath,
    palserverWorkingDirectory,
    palserverArguments: parseArguments(env.PALSERVER_ARGUMENTS),
    palserverProcessName: required(env.PALSERVER_PROCESS_NAME, 'PALSERVER_PROCESS_NAME'),
    gameHost: required(env.GAME_HOST, 'GAME_HOST'),
    gamePort: parseNumber(env.GAME_PORT, 'GAME_PORT', { min: 1, max: 65535 }),
    restApiHost: required(env.REST_API_HOST, 'REST_API_HOST'),
    restApiPort: parseNumber(env.REST_API_PORT, 'REST_API_PORT', { min: 1, max: 65535 }),
    restApiUsername: required(env.REST_API_USERNAME, 'REST_API_USERNAME'),
    restApiPassword: required(env.REST_API_PASSWORD, 'REST_API_PASSWORD'),
    playerCheckIntervalSeconds: parseNumber(env.PLAYER_CHECK_INTERVAL_SECONDS, 'PLAYER_CHECK_INTERVAL_SECONDS', { min: 5 }),
    emptyServerTimeoutMinutes: parseNumber(env.EMPTY_SERVER_TIMEOUT_MINUTES, 'EMPTY_SERVER_TIMEOUT_MINUTES', { min: 1 }),
    serverStartupTimeoutSeconds: parseNumber(env.SERVER_STARTUP_TIMEOUT_SECONDS, 'SERVER_STARTUP_TIMEOUT_SECONDS', { min: 30 }),
    serverShutdownTimeoutSeconds: parseNumber(env.SERVER_SHUTDOWN_TIMEOUT_SECONDS, 'SERVER_SHUTDOWN_TIMEOUT_SECONDS', { min: 10 }),
    wakeCooldownSeconds: parseNumber(env.WAKE_COOLDOWN_SECONDS, 'WAKE_COOLDOWN_SECONDS', { min: 0 }),
    logLevel: parseLogLevel(env.LOG_LEVEL),
  };
}

export function verifyPalserverPath(config: Pick<AppConfig, 'palserverExePath' | 'palserverWorkingDirectory'>): void {
  assertPathExists(config.palserverExePath);
  assertPathExists(config.palserverWorkingDirectory);
}
