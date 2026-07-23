# Overview

## Contexto do Projeto

- **Repositório:** `palworld-auto-manager/`
- **Linguagem:** TypeScript/Node.js (v22+)
- **O que faz:** Auto-sleep manager — desliga o servidor Palworld quando vazio, acorda quando alguém conecta via UDP
- **Plataformas suportadas:**
  - Windows nativo (`MANAGEMENT_MODE=native-windows`)
  - Linux/Docker (`MANAGEMENT_MODE=docker`)

### Estrutura do projeto

```
palworld-auto-manager/
├── src/
│   ├── index.ts                            # Ponto de entrada publico: chama bootstrap e mantem o processo vivo ate SIGINT/SIGTERM
│   ├── domain/                             # Regras puras
│   │   ├── state-manager.ts
│   │   └── player-count.ts
│   ├── application/                        # Casos de uso e ports
│   │   ├── process-manager.ts              # Shutdown seguro: save + delay + backup + shutdown
│   │   ├── idle-monitor.ts
│   │   ├── ports/
│   │   │   ├── server-process-driver.ts
│   │   │   └── backup-service.ts          # Port de backup pre-shutdown
│   │   └── factories/
│   │       ├── create-process-driver.ts
│   │       └── create-backup-service.ts   # Escolhe adapter conforme modo
│   ├── adapters/                           # Integrações externas
│   │   ├── palworld/
│   │   │   └── palworld-api.ts
│   │   ├── network/
│   │   │   └── udp-wake-listener.ts
│   │   ├── process/
│   │   │   ├── windows-process-driver.ts
│   │   │   ├── windows-process-utils.ts
│   │   │   └── docker-process-driver.ts
│   │   └── backup/
│   │       ├── docker-backup-service.ts    # docker exec <container> backup
│   │       └── noop-backup-service.ts      # Stub para modos sem backup
│   ├── shared/                             # Config, logger, utilitarios
│   │   ├── config.ts                       # Carrega .env com defaults saudaveis
│   │   ├── logger.ts                       # Pino com timestamp em timezone local
│   │   └── sleep.ts
│   └── entrypoints/
│       ├── index.ts                        # Entrypoint unico: chama bootstrap() e mantem o processo vivo
│       └── bootstrap.ts                    # Funcao bootstrap(dependencies) com injecao opcional de api/driver/backup
├── tests/
│   ├── process-manager.test.ts             # Cobre save falho, backup pre, delays, abort
│   ├── player-count.test.ts
│   ├── idle-monitor.test.ts
│   ├── palworld-api.test.ts                # Timeouts por operacao e retry em /save
│   ├── state-manager.test.ts
│   ├── shared/
│   │   └── config.test.ts                  # Cobre defaults das novas env vars
│   └── drivers/
│       ├── windows-process-driver.test.ts
│       └── docker-process-driver.test.ts
├── scripts/
│   ├── install-task.ps1
│   ├── test-scenarios/                     # Harness E2E leve (sem Docker) dos fluxos de idle shutdown
│   └── remove-task.ps1
├── cloud/
│   ├── 01-prepare-instance.sh
│   ├── 02-configure-firewall.sh
│   ├── 03-restore-save.sh
│   ├── backup-save-windows.ps1
│   ├── duckdns-updater.sh
│   ├── docker-compose.yml                  # stop_grace_period=240s, TZ=America/Sao_Paulo
│   ├── docker-compose.full.yml             # Compose unificado: server + manager
│   ├── Dockerfile.manager                  # Inclui tzdata, ENV TZ=America/Sao_Paulo
│   ├── .env.example                        # BACKUP a cada 4h, retencao 3 dias
│   ├── .env.docker.example                 # Defaults do manager para docker
│   ├── palworld-auto-manager.service       # systemd unit
│   ├── README.md
│   └── oracle-security-lists.md
├── docs/
│   ├── architecture/
│   │   └── overview.md
│   ├── decisions/
│   │   ├── README.md
│   │   ├── ADR-0001-estrutura-camadas-leves.toml
│   │   ├── ADR-0002-network-mode-host-udp-wake.toml
│   │   ├── ADR-0003-infraestrutura-cloud-oracle.toml
│   │   ├── ADR-0004-shutdown-seguro-backup-pre-shutdown.toml
│   │   ├── ADR-0005-tolerancia-falhas-shutdown-idle.toml
│   └── runbooks/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── update-map.ps1
```

## Decisões arquiteturais

- **Camadas leves:** separação em `domain`, `application`, `adapters`, `shared` e `entrypoints` para clareza sem excesso de formalismo.
- **Porta `ServerProcessDriver`:** abstração que permite suportar Windows nativo e Docker sem acoplamento.
- **Porta `BackupService`:** abstração para backup pre-shutdown. Adapter Docker executa `docker exec <container> backup`; adapter Noop para modos sem suporte.
- **Modo `network_mode: host` no manager:** escolhido para simplificar o wake listener UDP em ambientes Linux. Detalhes em `docs/decisions/ADR-0002-network-mode-host-udp-wake.toml`.
- **Shutdown seguro:** fluxo de parada com save verificado, delay configuravel (`SAVE_POST_DELAY_SECONDS`), waittime configuravel (`SHUTDOWN_API_WAITTIME_SECONDS`) e backup pre-shutdown opcional. Detalhes em `ADR-0004-shutdown-seguro-backup-pre-shutdown.toml`.
- **Timeouts alinhados:** `SERVER_SHUTDOWN_TIMEOUT_SECONDS` do manager e `stop_grace_period` do container Palworld devem ser iguais (240s por padrao). A quebra dessa invariante causa SIGKILL prematuro do Docker.
- **Tolerancia a falhas no shutdown por idle:** timeout dedicado para `/save` e `/shutdown` via `REST_API_SAVE_TIMEOUT_SECONDS` (60s), 1 retry em timeout para `/save`, e recuperacao automatica (RUNNING + idle + wake) quando o fluxo aborta. Detalhes em `ADR-0005-tolerancia-falhas-shutdown-idle.toml`.

## Fluxo de shutdown seguro

```
IdleMonitor (idle confirmado)
    └─> onIdleTimeout()
         ├─> stateManager.transition(STOPPING)
         ├─> idleMonitor.stop()
         └─> processManager.stopServer()
              ├─> backupService.isBackupRunning()?  -> aguarda
              ├─> backupService.runBackup()          # docker exec <c> backup (se habilitado)
              ├─> api.saveWorld()                    # POST /v1/api/save
              │   └─> falha? aborta e lanca erro
              ├─> sleep(SAVE_POST_DELAY_SECONDS * 1000)  # janela para flush
              ├─> api.shutdown(SHUTDOWN_API_WAITTIME_SECONDS, msg)
              ├─> aguarda isRunning() ate SERVER_SHUTDOWN_TIMEOUT_SECONDS
              └─> driver.stop()  # docker stop / taskkill (ultimo recurso)
```

## Comandos uteis

```bash
npm install
npm run dev
npm run build
npm test
npm run typecheck
npm run test:scenarios     # Harness E2E dos cenarios do ADR-0005
npm run typecheck:scripts  # Typecheck do harness em scripts/test-scenarios
```
