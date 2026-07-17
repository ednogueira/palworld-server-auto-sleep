# Overview

## Contexto do Projeto

- **Repositório:** `C:\Users\emers\Desktop\palworld-auto-manager`
- **Linguagem:** TypeScript/Node.js (v22+)
- **O que faz:** Auto-sleep manager — desliga o servidor Palworld quando vazio, acorda quando alguém conecta via UDP
- **Plataformas suportadas:**
  - Windows nativo (`MANAGEMENT_MODE=native-windows`)
  - Linux/Docker (`MANAGEMENT_MODE=docker`)

### Estrutura do projeto

```
palworld-auto-manager/
├── src/
│   ├── index.ts                            # Ponto de entrada publico (wrapper)
│   ├── domain/                             # Regras puras
│   │   ├── state-manager.ts
│   │   └── player-count.ts
│   ├── application/                        # Casos de uso e ports
│   │   ├── process-manager.ts
│   │   ├── idle-monitor.ts
│   │   ├── ports/
│   │   │   └── server-process-driver.ts
│   │   └── factories/
│   │       └── create-process-driver.ts
│   ├── adapters/                           # Integrações externas
│   │   ├── palworld/
│   │   │   └── palworld-api.ts
│   │   ├── network/
│   │   │   └── udp-wake-listener.ts
│   │   └── process/
│   │       ├── windows-process-driver.ts
│   │       ├── windows-process-utils.ts
│   │       └── docker-process-driver.ts
│   ├── shared/                             # Config, logger, utilitarios
│   │   ├── config.ts
│   │   ├── logger.ts
│   │   └── sleep.ts
│   └── entrypoints/
│       └── main.ts                         # Fluxo principal da aplicacao
├── tests/
│   ├── process-manager.test.ts
│   ├── player-count.test.ts
│   ├── idle-monitor.test.ts
│   ├── state-manager.test.ts
│   ├── shared/
│   │   └── config.test.ts
│   └── drivers/
│       ├── windows-process-driver.test.ts
│       └── docker-process-driver.test.ts
├── scripts/
│   ├── install-task.ps1
│   └── remove-task.ps1
├── cloud/
│   ├── 01-prepare-instance.sh
│   ├── 02-configure-firewall.sh
│   ├── 03-restore-save.sh
│   ├── backup-save-windows.ps1
│   ├── duckdns-updater.sh
│   ├── docker-compose.yml
│   ├── docker-compose.full.yml             # Compose unificado: server + manager
│   ├── Dockerfile.manager                  # Imagem do palworld-auto-manager
│   ├── .env.example
│   ├── .env.docker.example                 # Template para modo docker
│   ├── palworld-auto-manager.service       # systemd unit
│   ├── README.md
│   └── oracle-security-lists.md
├── docs/
│   ├── architecture/
│   │   └── overview.md
│   ├── decisions/
│   │   ├── README.md
│   │   ├── ADR-0001-estrutura-camadas-leves.toml
│   │   └── ADR-0002-network-mode-host-udp-wake.toml
│   ├── runbooks/
│   └── MIGRATION-PLAN.md
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── update-map.ps1
```

## Decisões arquiteturais

- **Camadas leves:** separação em `domain`, `application`, `adapters`, `shared` e `entrypoints` para clareza sem excesso de formalismo.
- **Porta `ServerProcessDriver`:** abstração que permite suportar Windows nativo e Docker sem acoplamento.
- **Modo `network_mode: host` no manager:** escolhido para simplificar o wake listener UDP em ambientes Linux. Detalhes em `docs/decisions/ADR-0002-network-mode-host-udp-wake.toml`.

## Comandos uteis

```bash
npm install
npm run dev
npm run build
npm test
npm run typecheck
```
