# Plano de Migração — Palworld Dedicated Server

Referência completa para continuidade do projeto. Criado para economizar tokens e evitar alucinações em novas sessões.

---

## Status do Projeto

| Fase | Descrição | Status |
|------|-----------|--------|
| **Fase 1** | Migrar servidor Palworld Windows → Oracle Cloud Ubuntu ARM64 | CONCLUÍDA |
| **Fase 2** | Adaptar auto-sleep manager para Linux/Docker (manter compatibilidade Windows) | EM_ANDAMENTO |
| **Fase 3** | Frontend Angular + nginx reverse proxy + auth | FUTURA |

---

## Contexto do Projeto

- **Repositório:** `C:\Users\emers\Desktop\palworld-auto-manager`
- **Linguagem:** TypeScript/Node.js (v22+)
- **O que faz:** Auto-sleep manager — desliga o servidor Palworld quando vazio, acorda quando alguém conecta via UDP
- **Plataforma original:** Windows (usa `tasklist`/`taskkill`, `PalServer.exe`)
- **Linha de código:** `src/utils/process-utils.ts` — específica do Windows (precisa portar para Linux na Fase 2)

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
│       └── main.ts                         # Fluxo principal
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
│   ├── install-task.ps1      # Registra tarefa agendada no Windows
│   └── remove-task.ps1       # Remove tarefa agendada no Windows
├── cloud/                    # Arquivos da Fase 1 e Fase 2
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
├── .env.example              # Template do .env (Windows local)
├── .gitignore                # Inclui .env
├── package.json
├── tsconfig.json
└── update-map.ps1            # Migra dados de mapa entre servidores (clientes)
```

---

## Fase 1 — CONCLUÍDA

### O que foi feito

Servidor Palworld Dedicated Server migrado do Windows local para Oracle Cloud Ubuntu ARM64 via Docker.

### Stack da infraestrutura (Oracle Cloud)

- **Instância:** Ubuntu 22.04 ARM64, 2 OCPU, 12GB RAM (free tier)
- **Firewall:** UFW (regras do `02-configure-firewall.sh`) + Security Lists da Oracle Cloud
- **DNS:** DuckDNS (`joga10.duckdns.org:8211`) — IP efêmero resolvido via cron a cada 5min
- **Docker:** `thijsvanloef/palworld-server-docker:latest` (multi-arch, usa box64 para ARM64)
- **Swap:** 8GB, `vm.swappiness=10`

### Arquivos criados (diretório `cloud/`)

| Arquivo | Função |
|---------|--------|
| `01-prepare-instance.sh` | Instala Docker + Compose, swap 8GB, tuning kernel |
| `02-configure-firewall.sh` | UFW: libera 8211/udp, 27015/udp; bloqueia 8212/tcp, 25575/tcp |
| `docker-compose.yml` | Container Palworld Server com limits de 10GB RAM |
| `.env.example` | Configs otimizadas (placeholder de senha, sem TARGET_MANIFEST_ID) |
| `03-restore-save.sh` | Sobe servidor → detecta hash novo → copia save do hash antigo |
| `backup-save-windows.ps1` | Compacta save Windows e envia via SCP |
| `duckdns-updater.sh` | DNS dinâmico + cron + logrotate |
| `README.md` | Documentação passo-a-passo da Fase 1 |
| `oracle-security-lists.md` | Instruções para Security Lists no console Oracle |

### Configurações do `.env` na instância

O `.env` na instância (`/opt/palworld/.env`) contém:

- `SERVER_NAME="Joga10 Pal Server"`, `SERVER_PASSWORD="123"`
- `ADMIN_PASSWORD=` (senha real, preenchida pelo usuário)
- `PAL_SPAWN_NUM_RATE=0.7` (otimização free tier)
- `DROP_ITEM_MAX_NUM=1000` (otimização free tier)
- `DROP_ITEM_ALIVE_MAX_HOURS=0.5` (otimização free tier)
- `SUPPLY_DROP_SPAN=360` (otimização free tier)
- `SERVER_REPLICATE_PAWN_CULL_DISTANCE=10000.0` (otimização free tier)
- `AUTO_SAVE_SPAN=60.0` (otimização free tier)
- `BASE_CAMP_WORKER_MAX_NUM=18`, `BASE_CAMP_MAX_NUM_IN_GUILD=6`, `COOP_PLAYER_MAX_NUM=5` (mantidos do .ini original)
- `WORKER_THREADS_SERVER=2`, `ENABLE_PERF_THREADING_ARGS=true` (2 OCPUs)
- `AUTO_UPDATE_ENABLED=true`, `TARGET_MANIFEST_ID` removido (atualizações automáticas)
- `RCON_ENABLED=true`, `REST_API_ENABLED=true` (necessários para auto-sleep manager)

### Configurações do PalWorldSettings.ini

A imagem Docker gera automaticamente o `PalWorldSettings.ini` a partir das ENV vars. O arquivo fica em:
```
/opt/palworld/palworld-data/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini
```

O `.env.example` NÃO contém senhas reais. É seguro versionar no git.

### Save

- **Hash antigo (Windows):** `F8C5770D4ED1F3EF6D90BBB274D20CA0`
- **Hash novo (Linux):** Gerado automaticamente pelo servidor na primeira execução
- **Caminho do save na instância:** `/opt/palworld/palworld-data/Pal/Saved/SaveGames/0/<hash_novo>/`
- **Backup de segurança:** Criado antes da restauração com sufixo `_backup_before_restore_<timestamp>`
- **Jogadores:** Precisam rodar `update-map.ps1` nos PCs para migrar o mapa

### Comandos úteis na instância

```bash
# Subir/parar/reiniciar
cd /opt/palworld
sudo docker compose up -d
sudo docker compose down
sudo docker compose restart

# Logs
sudo docker compose logs -f palworld-server

# Monitorar recursos
sudo docker stats palworld-server
free -h

# REST API (testar internamente)
curl -u admin:<SENHA> http://127.0.0.1:8212/v1/api/info

# RCON
sudo docker compose exec palworld-server rcon-cli

# Backup manual
sudo docker compose exec palworld-server backup
```

### Portas

| Porta | Protocolo | Exposta | Uso |
|-------|-----------|---------|-----|
| 8211 | UDP | Sim (público) | Porta do jogo |
| 27015 | UDP | Sim (público) | Query Steam |
| 8212 | TCP | Não (127.0.0.1) | REST API (auto-sleep manager) |
| 25575 | TCP | Não (127.0.0.1) | RCON |

### Pendências da Fase 1

- [ ] Verificar se todos os jogadores conseguem conectar via `joga10.duckdns.org:8211`
- [ ] Monitorar RAM/CPU com `docker stats` durante sessão com 5 jogadores
- [ ] Confirmar que o save está íntegro (bases, Pals, progresso)
- [ ] Testar se o DNS dinâmico DuckDNS atualiza corretamente ao reiniciar a instância

---

## Fase 2 — ADAPTAR AUTO-SLEEP MANAGER (PRÓXIMA)

### Objetivo

Portar o auto-sleep manager para Linux/Docker, **mantendo a compatibilidade Windows local**. O mesmo repositório deve funcionar nos dois modos.

### Modos de operação

```
MANAGEMENT_MODE=native-windows   → comportamento atual (Windows local)
MANAGEMENT_MODE=docker           → controla container Palworld via Docker
```

O `.env` sem `MANAGEMENT_MODE` definido deve assumir `native-windows` (mantém o Windows funcionando sem alteração).

### Arquitetura implementada

O projeto foi reorganizado em camadas leves, seguindo o padrão do exemplo
`node-ts-service`:

```text
src/
├── index.ts                            # Ponto de entrada publico (wrapper)
├── domain/                             # Regras puras
│   ├── state-manager.ts
│   └── player-count.ts
├── application/                        # Casos de uso e ports
│   ├── process-manager.ts
│   ├── idle-monitor.ts
│   ├── ports/
│   │   └── server-process-driver.ts
│   └── factories/
│       └── create-process-driver.ts
├── adapters/                           # Integrações externas
│   ├── palworld/
│   │   └── palworld-api.ts
│   ├── network/
│   │   └── udp-wake-listener.ts
│   └── process/
│       ├── windows-process-driver.ts
│       ├── windows-process-utils.ts
│       └── docker-process-driver.ts
├── shared/                             # Config, logger, utilitarios
│   ├── config.ts
│   ├── logger.ts
│   └── sleep.ts
└── entrypoints/
    └── main.ts                         # Fluxo principal da aplicacao
```

A porta `ServerProcessDriver` fica em `src/application/ports/server-process-driver.ts`
e os adapters Windows/Docker em `src/adapters/process/`. A selecao do driver e feita
por `createProcessDriver` com base em `MANAGEMENT_MODE`.

### Mudancas implementadas no codigo

#### 1. Interface `ServerProcessDriver` (application/ports)

```typescript
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
```

#### 2. `DockerProcessDriver` (adapters/process/docker-process-driver.ts)

Controla o container `palworld-server` via Docker CLI:
- `isRunning()`: `docker inspect --format '{{.State.Running}} {{.State.Pid}}'`
- `start()`: `docker start palworld-server`
- `stop()`: `docker stop palworld-server`
- `getSnapshot()`: `docker inspect`

#### 3. `WindowsProcessDriver` (adapters/process/windows-process-driver.ts)

Extrai a logica de `process-utils.ts` para implementar `ServerProcessDriver`.
Mantem `tasklist`/`taskkill`/`spawn PalServer.exe` — sem mudanca de comportamento.

#### 4. `ProcessManager` (application/process-manager.ts)

- Antes: chamava `process-utils` diretamente.
- Depois: recebe `ServerProcessDriver` injetado via construtor.
- `waitForReady()` e `stopServer()` com save/shutdown via REST API continuam iguais.
- `stopServer()` tenta desligamento limpo via API e, se necessario, chama
  `driver.stop()` como fallback forcado.

#### 5. `config.ts` (shared/config.ts)

Adicionado:
- `MANAGEMENT_MODE`: `'native-windows' | 'docker'` (sem default; obrigatorio)
- `DOCKER_CONTAINER_NAME`: obrigatorio quando `mode=docker`

Em modo `docker`: `PALSERVER_EXE_PATH`, `PALSERVER_WORKING_DIRECTORY`,
`PALSERVER_PROCESS_NAME` sao opcionais.
Em modo `native-windows`: caminhos continuam obrigatorios e validados.

#### 6. `index.ts` / `entrypoints/main.ts`

- `entrypoints/main.ts` contem o fluxo principal.
- `index.ts` e um wrapper publico para compatibilidade com scripts e `package.json`.
- Selecao do driver feita por `createProcessDriver({ config, logger })`.
- `verifyPalserverPath` e chamada dentro da factory apenas no modo Windows.

#### 7. `utils/process-utils.ts`

Movido para `src/adapters/process/windows-process-utils.ts` e encapsulado pelo
`WindowsProcessDriver`. Nao e mais importado diretamente pelo restante da
aplicacao.

#### 8. Modulos agnosticos

Mantidos e reposicionados na camada correta:
- `udp-wake-listener.ts` → `adapters/network/`
- `palworld-api.ts` → `adapters/palworld/`
- `idle-monitor.ts` → `application/`
- `state-manager.ts` → `domain/`
- `logger.ts` → `shared/`
- `sleep.ts` → `shared/`
- `player-count.ts` → `domain/`

#### 9. Testes

- Testes existentes atualizados para novos caminhos.
- Adicionados testes para `DockerProcessDriver` e `WindowsProcessDriver`.
- Adicionados testes para `loadConfig` com `MANAGEMENT_MODE`.
- `npm test` e `npm run typecheck` passam.

### Arquivos novos/alterados na Fase 2

| Arquivo | Funcao |
|---------|--------|
| `src/application/ports/server-process-driver.ts` | Interface `ServerProcessDriver` |
| `src/adapters/process/windows-process-driver.ts` | Implementacao Windows |
| `src/adapters/process/windows-process-utils.ts` | Funcoes Windows encapsuladas |
| `src/adapters/process/docker-process-driver.ts` | Implementacao Docker |
| `src/application/factories/create-process-driver.ts` | Factory de selecao de driver |
| `src/entrypoints/main.ts` | Fluxo principal extraido de `index.ts` |
| `cloud/Dockerfile.manager` | Multi-stage build com `node:22-alpine` |
| `cloud/docker-compose.full.yml` | Compose unificado com `network_mode: host` no manager |
| `cloud/.env.docker.example` | Template para modo docker |
| `cloud/palworld-auto-manager.service` | systemd unit |
| `docs/decisions/ADR-0001-estrutura-camadas-leves.toml` | ADR da reorganizacao |
| `docs/decisions/ADR-0002-network-mode-host-udp-wake.toml` | ADR do network_mode host |

### `cloud/docker-compose.full.yml`

```yaml
services:
  palworld-server:
    image: thijsvanloef/palworld-server-docker:latest
    container_name: palworld-server
    restart: unless-stopped
    ports:
      - "8211:8211/udp"
      - "27015:27015/udp"
    env_file:
      - .env
    volumes:
      - ./palworld-data:/palworld/

  palworld-auto-manager:
    build:
      context: ..
      dockerfile: cloud/Dockerfile.manager
    container_name: palworld-auto-manager
    restart: unless-stopped
    network_mode: host
    environment:
      - MANAGEMENT_MODE=docker
      - DOCKER_CONTAINER_NAME=palworld-server
      - REST_API_HOST=127.0.0.1
      - REST_API_PORT=8212
      - REST_API_USERNAME=${REST_API_USERNAME}
      - REST_API_PASSWORD=${REST_API_PASSWORD}
      - GAME_HOST=0.0.0.0
      - GAME_PORT=8211
      - PLAYER_CHECK_INTERVAL_SECONDS=${PLAYER_CHECK_INTERVAL_SECONDS}
      - EMPTY_SERVER_TIMEOUT_MINUTES=${EMPTY_SERVER_TIMEOUT_MINUTES}
      - SERVER_STARTUP_TIMEOUT_SECONDS=${SERVER_STARTUP_TIMEOUT_SECONDS}
      - SERVER_SHUTDOWN_TIMEOUT_SECONDS=${SERVER_SHUTDOWN_TIMEOUT_SECONDS}
      - WAKE_COOLDOWN_SECONDS=${WAKE_COOLDOWN_SECONDS}
      - LOG_LEVEL=${LOG_LEVEL}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - palworld-server
```

### Rede e portas na Fase 2

O container `palworld-auto-manager` usa `network_mode: host` para escutar UDP
`8211` diretamente no host quando o servidor esta parado. Quando um wake e
detectado, o listener fecha o socket e o container `palworld-server` inicia,
tomando posse da porta.

Essa abordagem e especifica para Linux (nao funciona no Docker Desktop
Windows/Mac). Veja `docs/decisions/ADR-0002-network-mode-host-udp-wake.toml`.

### Integracao com systemd

```ini
# /etc/systemd/system/palworld-auto-manager.service
[Unit]
Description=Palworld Auto Manager
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/palworld
ExecStart=/usr/bin/docker compose -f cloud/docker-compose.full.yml up -d
ExecStop=/usr/bin/docker compose -f cloud/docker-compose.full.yml down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
```

### Compatibilidade Windows (obrigatorio manter)

O `.env.example` da raiz inclui `MANAGEMENT_MODE=native-windows`:

```
MANAGEMENT_MODE=native-windows
PALSERVER_EXE_PATH=C:\Program Files (x86)\Steam\steamapps\common\PalServer\PalServer.exe
PALSERVER_WORKING_DIRECTORY=C:\Program Files (x86)\Steam\steamapps\common\PalServer
PALSERVER_PROCESS_NAME=PalServer-Win64-Test-Cmd.exe
```

Em modo `native-windows`, o projeto continua funcionando exatamente como antes.

### Pendencias da Fase 2

- [ ] Testar no Windows local (modo native-windows)
- [ ] Testar na instancia Oracle Cloud (modo docker)
- [ ] Validar wake listener UDP com servidor parado
- [ ] Confirmar que `docker stop` do container manager nao deixa o socket preso

### Ordem de implementacao da Fase 2

1. Reorganizar `src/` em camadas leves.
2. Criar `src/application/ports/server-process-driver.ts`.
3. Criar `src/adapters/process/windows-process-driver.ts`.
4. Criar `src/adapters/process/docker-process-driver.ts`.
5. Criar `src/application/factories/create-process-driver.ts`.
6. Refatorar `src/application/process-manager.ts`.
7. Ajustar `src/shared/config.ts` com `MANAGEMENT_MODE`.
8. Ajustar `src/entrypoints/main.ts` e manter `src/index.ts` como wrapper.
9. Criar `cloud/Dockerfile.manager`.
10. Criar `cloud/docker-compose.full.yml`.
11. Criar `cloud/.env.docker.example`.
12. Criar `cloud/palworld-auto-manager.service`.
13. Atualizar testes e adicionar testes para drivers/config.
14. Rodar `npm test` e `npm run typecheck`.
15. Testar no Windows local (modo native-windows).
16. Testar na instancia (modo docker).

---

## Fase 3 — FRONTEND ANGULAR (FUTURA)

Pendente. Itens:
- Frontend Angular para expor status do servidor, controles (ligar/desligar), logs
- Nginx como reverse proxy (já instalado na instância)
- Mecanismo de autenticação
- Integrar com REST API do auto-sleep manager

---

## Decisões Técnicas Importantes

| Decisão | Justificativa |
|---------|---------------|
| `TARGET_MANIFEST_ID` removido | Usuário quer updates automáticos entre servidor e cliente, mesmo com risco box64 |
| `AUTO_UPDATE_ENABLED=true` | Complementa a decisão acima |
| `ADMIN_PASSWORD` como placeholder no `.env.example` | Segurança — senha real fica só no `.env` da instância |
| Docker para o Palworld Server | Imagem já tem suporte ARM64 via box64, gerencia saves/backups/updates |
| Docker para o auto-sleep manager | Consistência de stack, facilita deploy e gerenciamento |
| `MANAGEMENT_MODE` com default `native-windows` | Compatibilidade total com usuários Windows existentes |
| `network_mode: host` no manager (Opção A) | Simplicidade para UDP wake listener |

---

## Ambiente de Desenvolvimento

```bash
# Instalar dependências
npm install

# Desenvolvimento (com hot reload)
npm run dev

# Build
npm run build

# Testes
npm test

# Typecheck
npm run typecheck
```

### Versões

- Node.js: v22+
- TypeScript: v5.7+
- Dependências: dotenv, pino
- Dev: tsx, vitest
