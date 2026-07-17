import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/shared/config';

function baseEnv(): Record<string, string> {
  return {
    MANAGEMENT_MODE: 'native-windows',
    PALSERVER_EXE_PATH: 'C:\\PalServer\\PalServer.exe',
    PALSERVER_WORKING_DIRECTORY: 'C:\\PalServer',
    PALSERVER_PROCESS_NAME: 'PalServer-Win64-Test-Cmd.exe',
    GAME_HOST: '0.0.0.0',
    GAME_PORT: '8211',
    REST_API_HOST: '127.0.0.1',
    REST_API_PORT: '8212',
    REST_API_USERNAME: 'admin',
    REST_API_PASSWORD: 'secret',
    PLAYER_CHECK_INTERVAL_SECONDS: '60',
    EMPTY_SERVER_TIMEOUT_MINUTES: '10',
    SERVER_STARTUP_TIMEOUT_SECONDS: '180',
    SERVER_SHUTDOWN_TIMEOUT_SECONDS: '90',
    WAKE_COOLDOWN_SECONDS: '30',
    LOG_LEVEL: 'info',
  };
}

describe('loadConfig', () => {
  it('carrega modo native-windows com valores padrao', () => {
    const config = loadConfig(baseEnv());
    expect(config.managementMode).toBe('native-windows');
    expect(config.palserverExePath).toBe('C:\\PalServer\\PalServer.exe');
    expect(config.palserverProcessName).toBe('PalServer-Win64-Test-Cmd.exe');
  });

  it('carrega modo docker com container name', () => {
    const env = {
      ...baseEnv(),
      MANAGEMENT_MODE: 'docker',
      DOCKER_CONTAINER_NAME: 'palworld-server',
      PALSERVER_EXE_PATH: undefined,
      PALSERVER_WORKING_DIRECTORY: undefined,
      PALSERVER_PROCESS_NAME: undefined,
    } as unknown as Record<string, string>;

    const config = loadConfig(env);
    expect(config.managementMode).toBe('docker');
    expect(config.dockerContainerName).toBe('palworld-server');
  });

  it('rejeita modo invalido', () => {
    const env = { ...baseEnv(), MANAGEMENT_MODE: 'invalid' };
    expect(() => loadConfig(env)).toThrow('MANAGEMENT_MODE invalido');
  });

  it('assume native-windows quando MANAGEMENT_MODE nao esta definido', () => {
    const { MANAGEMENT_MODE: _, ...envWithoutMode } = baseEnv();
    const config = loadConfig(envWithoutMode as Record<string, string>);
    expect(config.managementMode).toBe('native-windows');
  });

  it('rejeita modo docker sem DOCKER_CONTAINER_NAME', () => {
    const env = {
      ...baseEnv(),
      MANAGEMENT_MODE: 'docker',
    };
    expect(() => loadConfig(env)).toThrow('DOCKER_CONTAINER_NAME');
  });

  it('rejeita modo native-windows sem PALSERVER_EXE_PATH', () => {
    const env = { ...baseEnv(), PALSERVER_EXE_PATH: undefined } as unknown as Record<string, string>;
    expect(() => loadConfig(env)).toThrow('PALSERVER_EXE_PATH');
  });
});
