# Palworld Server Auto Sleep

[![Version](https://img.shields.io/badge/version-1.0.2-blue)](https://github.com/ednogueira/palworld-server-auto-sleep/releases/tag/v1.0.2)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-supported-2496ED)](https://www.docker.com/)
[![Vitest](https://img.shields.io/badge/tests-Vitest-6E9F18)](https://vitest.dev/)
[![Palworld](https://img.shields.io/badge/Palworld-Dedicated%20Server-red)](https://store.steampowered.com/app/1623730/Palworld/)
[![OpenCode](https://img.shields.io/badge/OpenCode-Config-purple)](https://opencode.ai)
[![License](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

Protege sua campanha de Palworld desligando automaticamente o servidor dedicado quando não há jogadores online. Quando alguém tenta conectar, o servidor acorda automaticamente do último save — evitando morte dos Pals, deterioração da base e perda de progressão.

## Índice

- [Como funciona](#como-funciona)
- [Modos de operação](#modos-de-operação)
- [Instalação — Windows nativo](#instalação--windows-nativo)
- [Instalação — Cloud / Docker](#instalação--cloud--docker)
- [Configuração](#configuração)
- [Uso](#uso)
- [Wake UDP (acordar automaticamente)](#wake-udp-acordar-automaticamente)
- [Iniciar com o Windows](#iniciar-com-o-windows)
- [Utilitários](#utilitários)
- [Solução de problemas](#solução-de-problemas)

---

## Como funciona

```
PC desliga → Servidor para → Jogador tenta conectar → Servidor acorda
         ↑                                                        ↓
    (ninguém online)                                    (alguém conectou)
         ↑                                                        ↓
    Servidor "dorme" ← Timer esgotou ← Último jogador saiu ← Jogadores jogam
```

1. **Inicialização**: o servidor inicia automaticamente quando o computador liga
2. **Jogo ativo**: jogadores conectam e jogam normalmente
3. **Ociosidade**: quando o último jogador sai, um timer começa a contar
4. **Sleep**: se ninguém conectar dentro do tempo configurado, o servidor salva o mundo e desliga
5. **Wake**: o gerenciador passa a escutar a porta UDP `8211`. Quando um jogador tenta conectar, o pacote UDP acorda o servidor, que volta exatamente de onde parou

---

## Modos de operação

O projeto suporta dois modos definidos pela variável `MANAGEMENT_MODE`:

| Modo | Descrição | Plataforma |
|------|-----------|------------|
| `native-windows` | Comportamento original: spawn direto do `PalServer.exe` | Windows |
| `docker` | Controla container Palworld via Docker CLI + REST API | Linux / Cloud |

Sem a variável definida, assume `native-windows` para manter compatibilidade total com instalações Windows existentes.

### Arquitetura

```
src/
├── index.ts              → entrypoint: chama bootstrap() e mantem o processo vivo
├── domain/               → regras puras (state-manager, player-count)
├── application/          → casos de uso + ports (process-manager, idle-monitor, ServerProcessDriver, BackupService)
├── adapters/             → integracoes externas (palworld-api, udp-wake-listener, drivers processo, backup services)
├── shared/               → config, logger, sleep
└── entrypoints/
    └── bootstrap.ts      → logica de inicializacao (state machine, idle monitor, signal handlers)
```

A abstração `ServerProcessDriver` permite que o `ProcessManager` controle o servidor
indiferentemente do sistema operacional — Windows usa `tasklist`/`taskkill`/`spawn`,
Docker usa `docker start`/`stop`/`inspect`.

---

## Instalação — Windows nativo

### 1. Pré-requisitos

Certifique-se de ter instalado no computador que **rodará o servidor**:

| Item | Versão / Observação |
|------|---------------------|
| **Windows** | 10 ou 11 |
| **Node.js** | v22 ou superior ([baixar](https://nodejs.org/)) |
| **Palworld Dedicated Server** | Instalado via Steam (gratuito separado do jogo) |

### 2. Baixe o projeto

```bash
git clone https://github.com/ednogueira/palworld-server-auto-sleep.git
cd palworld-server-auto-sleep
npm install
```

### 3. Configure o servidor Palworld

Edite o arquivo `PalWorldSettings.ini` (geralmente em `Pal\Saved\Config\WindowsServer\`) e garanta:

```ini
AdminPassword="sua-senha-forte"
RESTAPIEnabled=True
RESTAPIPort=8212
PublicPort=8211
```

> ⚠️ A porta `8212` (REST API) **não** deve ser exposta na internet. Mantenha-a acessível apenas localmente (firewall bloqueando acesso externo).

**Como achar o caminho do PalServer.exe:**

```
C:\Program Files (x86)\Steam\steamapps\common\PalServer\PalServer.exe
```

Se não for esse, localize a pasta do servidor dedicado na sua biblioteca Steam.

---

## Instalação — Cloud / Docker

Para rodar o auto-sleep manager em um servidor Linux com Docker (Oracle Cloud, AWS, etc.):

### 1. Pré-requisitos na instância

- Ubuntu 22.04+ (ARM64 ou x86)
- Docker + Docker Compose v2
- Container Palworld já rodando (`thijsvanloef/palworld-server-docker`)

### 2. Copiar artefatos

```bash
scp -r .\src\ ubuntu@seu-servidor:/opt/palworld/auto-manager/
scp -r .\cloud\ ubuntu@seu-servidor:/opt/palworld/auto-manager/
scp .\package.json .\tsconfig.json ubuntu@seu-servidor:/opt/palworld/auto-manager/
```

### 3. Subir o manager

```bash
ssh ubuntu@seu-servidor
cd /opt/palworld/auto-manager
cp cloud/.env.docker.example cloud/.env
nano cloud/.env   # preencher senhas
sudo docker compose -f cloud/docker-compose.full.yml up -d
```

### 4. (Opcional) systemd para boot automático

```bash
sudo cp cloud/palworld-auto-manager.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable palworld-auto-manager
sudo systemctl start palworld-auto-manager
```

> **Detalhes completos de deploy em:** [`cloud/README.md`](cloud/README.md)

---

## Configuração

### Windows nativo

Configure as variáveis no `.env`:

| Variável | O que preencher |
|----------|----------------|
| `MANAGEMENT_MODE` | `native-windows` (ou omita — é o padrão) |
| `PALSERVER_EXE_PATH` | Caminho completo do `PalServer.exe` |
| `PALSERVER_WORKING_DIRECTORY` | Pasta onde o PalServer.exe está |
| `PALSERVER_PROCESS_NAME` | Nome do processo (veja no Gerenciador de Tarefas) |
| `REST_API_PASSWORD` | A mesma senha definida em `AdminPassword` no PalWorldSettings.ini |

### Modo Docker

Use o template em `cloud/.env.docker.example`:

| Variável | O que preencher |
|----------|----------------|
| `MANAGEMENT_MODE` | `docker` |
| `DOCKER_CONTAINER_NAME` | Nome do container Palworld (ex: `palworld-server`) |
| `REST_API_PASSWORD` | A mesma senha do `.env` do servidor Palworld |

### Variáveis comuns (ambos os modos)

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `GAME_HOST` | `0.0.0.0` | IP do wake listener |
| `GAME_PORT` | `8211` | Porta UDP do jogo |
| `PLAYER_CHECK_INTERVAL_SECONDS` | `60` | Frequência de verificação de jogadores |
| `EMPTY_SERVER_TIMEOUT_MINUTES` | `10` | Tempo ocioso antes de desligar |
| `SERVER_STARTUP_TIMEOUT_SECONDS` | `180` | Tempo máximo de boot do servidor |
| `SERVER_SHUTDOWN_TIMEOUT_SECONDS` | `240` | Tempo máximo de shutdown. **Deve ser igual ao `stop_grace_period` do container** |
| `SAVE_POST_DELAY_SECONDS` | `20` | Espera (em s) entre `POST /save` e `POST /shutdown`. Janela para o flush do save em disco. |
| `SHUTDOWN_API_WAITTIME_SECONDS` | `30` | Parâmetro `waittime` enviado ao `POST /shutdown`. |
| `REST_API_SAVE_TIMEOUT_SECONDS` | `60` | Timeout (em s) para `POST /save` e `POST /shutdown`. Maior que o padrão (10s) para tolerar saves pesados. |
| `PRE_SHUTDOWN_BACKUP_ENABLED` | `false` | Quando `true` (Docker), executa `docker exec <container> backup` antes de salvar. |
| `PRE_SHUTDOWN_BACKUP_MAX_WAIT_SECONDS` | `120` | Tempo máximo esperando backup em andamento terminar. |
| `WAKE_COOLDOWN_SECONDS` | `30` | Cooldown entre wakes repetidos |
| `TZ` | (não definido) | Timezone para logs e timestamps de backup. Sugerido: `America/Sao_Paulo`. |
| `LOG_LEVEL` | `info` | Nível de log (`info`, `debug`, `trace`) |

### Shutdown seguro (proteção contra corrupção de save)

O fluxo de parada segue esta ordem:

1. **(Opcional) Backup pre-shutdown** — `docker exec <container> backup` (apenas Docker).
2. **`POST /save`** — se falhar, o shutdown é abortado para preservar o mundo.
3. **Espera `SAVE_POST_DELAY_SECONDS`** — janela para o flush em disco.
4. **`POST /shutdown`** com `waittime=SHUTDOWN_API_WAITTIME_SECONDS`.
5. **Aguarda processo encerrar** (até `SERVER_SHUTDOWN_TIMEOUT_SECONDS`).
6. **Último recurso:** `docker stop` ou `taskkill`.

> ⚠️ O `stop_grace_period` do container `palworld-server` (em `docker-compose.yml`) deve ser **igual** ao `SERVER_SHUTDOWN_TIMEOUT_SECONDS`. O padrão é `240s` em ambos. Se o Docker matar o container antes (`stop_grace_period` menor), o manager não tem como salvar.

### Firewall e roteador

| Porta | Protocolo | Destino | Observação |
|-------|-----------|---------|------------|
| `8211` | UDP | Público (roteador + firewall) | Porta do jogo — jogadores conectam aqui |
| `8212` | TCP | Local apenas (firewall) | REST API — só o gerenciador acessa |

No **roteador**, encaminhe UDP `8211` para o IP do computador (use IP fixo ou reserva DHCP).

---

## Uso

### Desenvolvimento (com reload automático)

```bash
npm run dev
```

### Produção

```bash
npm run build
npm start
```

### Testes

```bash
npm test          # testes unitarios (Vitest)
npm run test:scenarios   # E2E leve dos cenarios do ADR-0005 (sem Docker)
```

### Verificar tipos TypeScript

```bash
npm run typecheck          # src/
npm run typecheck:scripts  # scripts/test-scenarios/
```

---

## Wake UDP (acordar automaticamente)

Quando o servidor está parado, o gerenciador abre a porta `8211` e fica escutando. Assim que um pacote UDP chega (um jogador tentando conectar), ele **inicia o servidor automaticamente**.

**Limitação importante:**
- O primeiro pacote UDP recebido **não é repassado** ao Palworld — ele serve apenas como gatilho
- O jogador precisará esperar o servidor iniciar e tentar conectar novamente
- Não é possível prometer conexão instantânea

### Como testar manualmente

1. Pare o `PalServer.exe`
2. Confirme que a porta `8211` está sendo escutada pelo gerenciador
3. Envie qualquer pacote UDP para `8211` (ex: de outro computador, ou com ferramenta como `netcat`)
4. O servidor deve iniciar automaticamente

---

## Iniciar com o Windows

Para que o gerenciador inicie automaticamente quando o computador ligar:

```powershell
.\scripts\install-task.ps1 -Trigger Startup
```

Para iniciar apenas quando você fizer logon:

```powershell
.\scripts\install-task.ps1 -Trigger Logon
```

Para remover a tarefa:

```powershell
.\scripts\remove-task.ps1
```

> ⚠️ Execute o PowerShell **como administrador** para instalar a tarefa.

A tarefa será registrada como `PalworldServerAutoSleep` no Agendador de Tarefas do Windows, executando como `SYSTEM` com reinício automático em caso de falha.

---

## Utilitários

### Migrar dados de mapa entre servidores (`update-map.ps1`)

Quando o servidor Palworld é migrado para outro local (reinstalação, troca de máquina, mudança de hash), cada jogador perde o progresso do **mapa** (exploração, marcações, ícones) ao logar no novo servidor, mesmo que a campanha continue intacta.

Este script copia os dados de mapa da pasta com hash antigo para a pasta com hash novo.

**Quando usar:**
- Você migrou o servidor e o hash mudou
- Jogadores reportam o mapa "inexplorado" (sem ícones, sem marcas)
- A campanha do servidor foi restaurada de backup, mas os mapas individuais não acompanharam

**Fluxo para cada jogador:**

1. Conecte no novo servidor **uma vez** (para criar a pasta com hash novo)
2. Feche o Palworld
3. No PowerShell, execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-map.ps1
```

4. Conecte no servidor — seu mapa estará preservado

**Como encontrar os hashes:**

```
%LOCALAPPDATA%\Pal\Saved\SaveGames
```

Dentro da pasta com seu ID Steam, você verá pastas com nomes de **32 caracteres hexadecimais**:
- **HASH ANTIGO** = pasta com dados de mapa do servidor antigo
- **HASH NOVO** = pasta criada quando conectou no novo servidor

**Hashes atualizados (Fase 2 — servidor cloud):**

| Hash | Origem |
|------|--------|
| `AABBCCDD112233445566778899AABBCC` | Hash original do servidor Windows local |
| `AABBCCDD112233445566778899AABBCC` | 1ª migração para cloud (Windows → Linux) |
| **`AABBCCDD112233445566778899AABBCC`** | **Hash atual do servidor cloud** |

O script detecta automaticamente qual hash antigo você possui (se já migrou antes ou
ainda está no Windows original) e copia os dados para o hash cloud atual.

**Comportamento do script:**

| Situação | O que acontece |
|----------|----------------|
| Hash antigo conhecido encontrado | Usa automaticamente, sem perguntar |
| Nenhum hash conhecido encontrado | Pede para digitar os hashes manualmente |
| Hash inválido | Valida formato de 32 caracteres hexadecimais |
| Backup automático | Cria backup com sufixo `_backup_PS` |
| Múltiplos usuários Steam | Processa todos automaticamente |

---

## Solução de problemas

| Problema | Possível causa | Solução |
|----------|---------------|---------|
| API local não responde | `RESTAPIEnabled` ou `RESTAPIPort` incorretos | Verifique `PalWorldSettings.ini` |
| Wake não inicia o servidor | Porta `8211` não encaminhada no roteador | Configure o encaminhamento UDP |
| Servidor não desliga sozinho | API não retorna lista válida de jogadores | Confira as credenciais da REST API |
| Script de instalação falha | PowerShell sem privilégios de admin | Execute como administrador |
| Servidor fecha sozinho | Timer de sleep muito curto | Ajuste `EMPTY_SERVER_TIMEOUT_MINUTES` no `.env` |