import { setTimeout as delay } from 'node:timers/promises';
import { bootstrap } from '../../src/entrypoints/bootstrap';
import { PalworldApi } from '../../src/adapters/palworld/palworld-api';
import type { AppConfig } from '../../src/shared/config';
import { StubPalworldApi } from './stub-api';
import { StubProcessDriver } from './stub-driver';
import { StubBackupService } from './stub-backup';

interface ScenarioContext {
  config: AppConfig;
  stubApi: StubPalworldApi;
  driver: StubProcessDriver;
  backup: StubBackupService;
}

interface SetupResult {
  shutdown: () => Promise<void>;
  state: { get: () => string };
}

function buildConfig(opts: {
  apiPort: number;
  gamePort: number;
  saveTimeoutSeconds: number;
  shutdownTimeoutSeconds: number;
  savePostDelaySeconds: number;
  playerCheckIntervalSeconds: number;
  emptyServerTimeoutMinutes: number;
}): AppConfig {
  return {
    managementMode: 'docker',
    dockerContainerName: 'stub',
    palserverArguments: [],
    gameHost: '127.0.0.1',
    gamePort: opts.gamePort,
    restApiHost: '127.0.0.1',
    restApiPort: opts.apiPort,
    restApiUsername: 'admin',
    restApiPassword: 'secret',
    playerCheckIntervalSeconds: opts.playerCheckIntervalSeconds,
    emptyServerTimeoutMinutes: opts.emptyServerTimeoutMinutes,
    serverStartupTimeoutSeconds: 30,
    serverShutdownTimeoutSeconds: opts.shutdownTimeoutSeconds,
    wakeCooldownSeconds: 0,
    savePostDelaySeconds: opts.savePostDelaySeconds,
    shutdownApiWaittimeSeconds: 1,
    preShutdownBackupEnabled: false,
    preShutdownBackupMaxWaitSeconds: 60,
    restApiSaveTimeoutSeconds: opts.saveTimeoutSeconds,
    logLevel: 'info',
  };
}

async function setupScenario(ctx: ScenarioContext): Promise<SetupResult> {
  await ctx.stubApi.start();
  ctx.driver.simulateRunning(true);

  const api = new PalworldApi({
    host: ctx.config.restApiHost,
    port: ctx.config.restApiPort,
    username: ctx.config.restApiUsername,
    password: ctx.config.restApiPassword,
    saveTimeoutMs: ctx.config.restApiSaveTimeoutSeconds * 1000,
  });

  const result = await bootstrap({
    config: ctx.config,
    api,
    driver: ctx.driver,
    backupService: ctx.backup,
  });

  return {
    state: { get: () => result.stateManager.getState() },
    shutdown: async (): Promise<void> => {
      await result.shutdown();
      await ctx.stubApi.stop();
    },
  };
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 200,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await delay(intervalMs);
  }
  return false;
}

interface ScenarioResult {
  name: string;
  passed: boolean;
  details: string[];
}

interface Scenario {
  name: string;
  run: () => Promise<ScenarioResult>;
}

const scenarios: Scenario[] = [
  {
    name: 'Cenario 1: /save lento usa timeout dedicado sem abortar',
    run: async () => {
      const basePort = 18000;
      const stubApi = new StubPalworldApi({ port: basePort + 2 });
      const ctx: ScenarioContext = {
        config: buildConfig({
          apiPort: basePort + 2,
          gamePort: basePort + 1,
          saveTimeoutSeconds: 10,
          shutdownTimeoutSeconds: 30,
          savePostDelaySeconds: 0,
          playerCheckIntervalSeconds: 1,
          emptyServerTimeoutMinutes: 1,
        }),
        stubApi,
        driver: new StubProcessDriver(stubApi),
        backup: new StubBackupService(),
      };
      ctx.stubApi.setPlayers(0);
      ctx.stubApi.setSaveBehavior({ delayMs: 3_000 });

      const { shutdown, state } = await setupScenario(ctx);

      const idleTimeoutMinutes = ctx.config.emptyServerTimeoutMinutes;
      const totalIdleWaitMs = (idleTimeoutMinutes * 60 + 15) * 1000;
      const idleFired = await waitFor(
        () => ctx.stubApi.getSaveCount() >= 1,
        totalIdleWaitMs,
        500,
      );

      const stopped = await waitFor(() => state.get() === 'STOPPED', 35_000);

      const details: string[] = [
        `saveDelayMs (stub): 3000`,
        `saveTimeoutSeconds (manager): 10 (absorve o save de 3s sem abortar)`,
        `saveCount apos idle shutdown: ${ctx.stubApi.getSaveCount()} (esperado >=1)`,
        `estado final: ${state.get()} (esperado STOPPED)`,
        `driver.stopCalls: ${ctx.driver.stopCalls} (esperado 0 se shutdown cooperativo passou)`,
      ];

      await shutdown();
      return {
        name: 'Cenario 1',
        passed: idleFired && stopped,
        details,
      };
    },
  },

  {
    name: 'Cenario 2: /save sempre falha — manager RECUPERA para RUNNING em vez de ficar preso em STOPPING',
    run: async () => {
      const basePort = 18100;
      const stubApi = new StubPalworldApi({ port: basePort + 2 });
      const ctx: ScenarioContext = {
        config: buildConfig({
          apiPort: basePort + 2,
          gamePort: basePort + 1,
          saveTimeoutSeconds: 3,
          shutdownTimeoutSeconds: 30,
          savePostDelaySeconds: 0,
          playerCheckIntervalSeconds: 1,
          emptyServerTimeoutMinutes: 1,
        }),
        stubApi,
        driver: new StubProcessDriver(stubApi),
        backup: new StubBackupService(),
      };
      ctx.stubApi.setPlayers(0);
      ctx.stubApi.setSaveBehavior({ fail: true });

      const { shutdown, state } = await setupScenario(ctx);

      const recovered = await waitFor(() => state.get() === 'RUNNING', 30_000);
      const details = [
        `saveBehavior.fail = true (cada chamada /save responde 500)`,
        `saveTimeoutSeconds: 3`,
        `estado final: ${state.get()} (esperado RUNNING apos recuperacao)`,
        `save attempts (incluindo retries): ${ctx.stubApi.getSaveAttempts()}`,
        `save completadas: ${ctx.stubApi.getSaveCount()} (esperado 0, save sempre falha)`,
      ];

      await shutdown();
      return {
        name: 'Cenario 2',
        passed: recovered,
        details,
      };
    },
  },

  {
    name: 'Cenario 3: /save + /shutdown cooperativos concluem antes do timeout (state STOPPED, sem driver.stop)',
    run: async () => {
      const basePort = 18200;
      const stubApi = new StubPalworldApi({ port: basePort + 2 });
      const ctx: ScenarioContext = {
        config: buildConfig({
          apiPort: basePort + 2,
          gamePort: basePort + 1,
          saveTimeoutSeconds: 5,
          shutdownTimeoutSeconds: 30,
          savePostDelaySeconds: 0,
          playerCheckIntervalSeconds: 1,
          emptyServerTimeoutMinutes: 1,
        }),
        stubApi,
        driver: new StubProcessDriver(stubApi),
        backup: new StubBackupService(),
      };
      ctx.stubApi.setPlayers(0);
      ctx.stubApi.setSaveBehavior({ delayMs: 200 });
      ctx.stubApi.setShutdownBehavior({ delayMs: 1_500 });

      const { shutdown, state } = await setupScenario(ctx);
      const idleTimeoutMinutes = ctx.config.emptyServerTimeoutMinutes;
      const totalIdleWaitMs = (idleTimeoutMinutes * 60 + 15) * 1000;

      await waitFor(() => ctx.stubApi.getSaveCount() >= 1, totalIdleWaitMs, 500);
      const stopped = await waitFor(() => state.get() === 'STOPPED', 30_000);

      const details = [
        `saveDelayMs: 200 (rapido)`,
        `shutdownDelayMs: 1500 (lento, mas dentro de serverShutdownTimeoutSeconds=30)`,
        `estado final: ${state.get()} (esperado STOPPED via shutdown cooperativo)`,
        `driver.stopCalls: ${ctx.driver.stopCalls} (esperado 0 — driver NAO foi chamado porque isRunning voltou false antes do timeout)`,
      ];

      await shutdown();
      return {
        name: 'Cenario 3',
        passed: stopped && ctx.driver.stopCalls === 0,
        details,
      };
    },
  },
];

async function main(): Promise<void> {
  console.log('Executando cenarios E2E...\n');
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    console.log(`-> ${scenario.name}`);
    try {
      const result = await scenario.run();
      results.push(result);
    } catch (error) {
      results.push({
        name: scenario.name,
        passed: false,
        details: [`Erro inesperado: ${error instanceof Error ? error.message : String(error)}`],
      });
    }
    console.log('');
  }

  console.log('=== Resultados ===');
  for (const r of results) {
    const tag = r.passed ? '[OK]' : '[FAIL]';
    console.log(`${tag} ${r.name}`);
    for (const d of r.details) {
      console.log(`     - ${d}`);
    }
  }

  const failed = results.filter((r) => !r.passed).length;
  if (failed > 0) {
    console.log(`\n${failed}/${results.length} cenarios falharam.`);
    process.exit(1);
  } else {
    console.log(`\n${results.length}/${results.length} cenarios passaram.`);
  }
}

void main();
