# Palworld Server — Deploy completo na Oracle Cloud

Guia unificado para implantar o servidor Palworld + auto-sleep manager em
uma instância Ubuntu ARM64 na Oracle Cloud.

## Stack

| Componente | Tecnologia |
|------------|------------|
| Servidor Palworld | `thijsvanloef/palworld-server-docker` |
| Auto-sleep manager | Node.js 22 + Docker (`palworld-auto-manager`) |
| DNS dinâmico | DuckDNS (`joga10.duckdns.org`) |
| Firewall | UFW + Security Lists Oracle Cloud |
| SO | Ubuntu 22.04 ARM64 (2 OCPU, 12GB RAM free tier) |

## Arquivos neste diretório

| Arquivo | Descrição |
|---------|-----------|
| `01-prepare-instance.sh` | Prepara a instância: Docker, swap 8GB, tuning kernel |
| `02-configure-firewall.sh` | UFW: libera 8211/udp, 27015/udp; bloqueia 8212, 25575 |
| `docker-compose.yml` | Compose do servidor Palworld (server apenas) |
| `docker-compose.full.yml` | Compose unificado: server + auto-sleep manager |
| `Dockerfile.manager` | Multi-stage build do auto-sleep manager |
| `.env.example` | Template de config do servidor Palworld (sem senhas reais) |
| `.env.docker.example` | Template de config do auto-sleep manager modo docker |
| `03-restore-save.sh` | Restaura save migrado do Windows para o novo hash |
| `backup-save-windows.ps1` | Compacta e envia o save do Windows via SCP |
| `duckdns-updater.sh` | DNS dinâmico DuckDNS + cron + logrotate |
| `oracle-security-lists.md` | Instruções para liberar portas no console Oracle |
| `palworld-auto-manager.service` | systemd unit para boot automático do manager |

## Pré-requisitos

- Instância Ubuntu ARM64 na Oracle Cloud (free tier, 2 OCPU / 12GB)
- Acesso SSH à instância
- Save atual do Palworld no Windows (em
  `Pal\Saved\SaveGames\0\<hash_antigo>\`)
- Chave SSH `.pem` para acessar a instância

## Passo a passo

### 1. Preparar a instância

```bash
scp -r cloud/ ubuntu@<IP_DA_INSTANCIA>:/tmp/
ssh ubuntu@<IP_DA_INSTANCIA>
sudo bash /tmp/cloud/01-prepare-instance.sh
```

### 2. Depositar configuração do servidor

```bash
sudo mkdir -p /opt/palworld
sudo cp /tmp/cloud/docker-compose.yml /opt/palworld/
sudo cp /tmp/cloud/.env.example /opt/palworld/.env
sudo cp /tmp/cloud/02-configure-firewall.sh /opt/palworld/
sudo cp /tmp/cloud/03-restore-save.sh /opt/palworld/
sudo cp /tmp/cloud/duckdns-updater.sh /opt/palworld/

sudo nano /opt/palworld/.env   # preencher ADMIN_PASSWORD
```

### 3. Configurar firewall

```bash
sudo bash /opt/palworld/02-configure-firewall.sh
```

### 4. Liberar portas no console Oracle Cloud

Veja detalhes em `oracle-security-lists.md`.

| Source | Protocol | Port | Descrição |
|--------|----------|------|-----------|
| `0.0.0.0/0` | UDP | 8211 | Palworld jogo |
| `0.0.0.0/0` | UDP | 27015 | Steam query |

**Não** liberar 8212 (REST API) nem 25575 (RCON) externamente.

### 5. Configurar DuckDNS

```bash
sudo tee /opt/palworld/.duckdns << 'EOF'
DUCKDNS_DOMAIN=joga10
DUCKDNS_TOKEN=seu-token-aqui
EOF
sudo chmod 600 /opt/palworld/.duckdns
sudo bash /opt/palworld/duckdns-updater.sh --install
sudo bash /opt/palworld/duckdns-updater.sh   # testar
```

Jogadores conectam em: `joga10.duckdns.org:8211`

### 6. Transferir e restaurar o save

**No Windows (PowerShell):**

```powershell
.\cloud\backup-save-windows.ps1 -InstanceIp <IP> -SshKeyPath C:\caminho\chave.pem
```

**Na instância:**

```bash
sudo bash /opt/palworld/03-restore-save.sh
```

> Acompanhe os logs do servidor durante o restore:
> `sudo docker compose logs -f palworld-server`

### 7. Subir o auto-sleep manager

Copiar artefatos do manager para a instância:

```bash
# Do seu Windows (PowerShell com SCP)
scp -r .\src\ ubuntu@joga10.duckdns.org:/opt/palworld/auto-manager/
scp -r .\cloud\ ubuntu@joga10.duckdns.org:/opt/palworld/auto-manager/
scp .\package.json .\tsconfig.json ubuntu@joga10.duckdns.org:/opt/palworld/auto-manager/
```

Na instância:

```bash
ssh ubuntu@joga10.duckdns.org
cd /opt/palworld/auto-manager
cp cloud/.env.docker.example .env   # criar baseado no template
cp .env cloud/.env                   # compose espera .env dentro de cloud/
nano .env                            # preencher senhas
```

O `.env` do manager deve ter:

```
MANAGEMENT_MODE=docker
DOCKER_CONTAINER_NAME=palworld-server
REST_API_HOST=127.0.0.1
REST_API_PORT=8212
REST_API_USERNAME=admin
REST_API_PASSWORD=<mesma do .env do palworld-server>
GAME_HOST=0.0.0.0
GAME_PORT=8211
PLAYER_CHECK_INTERVAL_SECONDS=60
EMPTY_SERVER_TIMEOUT_MINUTES=10
LOG_LEVEL=info
```

Build + subir:

```bash
sudo cp cloud/docker-compose.full.yml /opt/palworld/
sudo cp cloud/Dockerfile.manager /opt/palworld/
cd /opt/palworld
sudo docker compose -f cloud/docker-compose.full.yml up -d palworld-auto-manager
```

Verificar logs:

```bash
sudo docker logs -f palworld-auto-manager
```

### 8. (Opcional) systemd para boot automático

```bash
sudo cp cloud/palworld-auto-manager.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable palworld-auto-manager
sudo systemctl start palworld-auto-manager
```

## Testar cenários

### A — Servidor já rodando
- Manager detecta servidor em execução e entra em modo monitoramento
- Log: `[RUNNING] Servidor ja estava em execucao.`

### B — Idle timeout
- `docker stop palworld-server`
- Manager detecta parada e ativa wake listener
- Log: `[STOPPED] Servidor parou inesperadamente.` → `[STOPPED] Wake listener ativo`

### C — Wake via UDP
- Servidor parado + manager escutando → jogador tenta conectar
- Log: `[WAKE] Pacote recebido` → `[STARTING]` → `[RUNNING]`

## Rollback

Se algo der errado, os composes são independentes:

```bash
# Parar só o manager
sudo docker compose -f cloud/docker-compose.full.yml down palworld-auto-manager

# O palworld-server continua rodando
# Volte ao modo native-windows no Windows sem alterações
```

## Comandos úteis

| Comando | Descrição |
|---------|-----------|
| `docker compose up -d` | Subir servidor Palworld |
| `docker compose down` | Parar servidor |
| `docker compose logs -f` | Logs do servidor em tempo real |
| `docker stats palworld-server` | Monitorar CPU/RAM |
| `docker exec palworld-server rcon-cli` | Console RCON |
| `docker exec palworld-server backup` | Backup manual |
| `docker compose -f cloud/docker-compose.full.yml up -d` | Subir manager |
| `docker logs -f palworld-auto-manager` | Logs do manager |
| `free -h` | Uso de memória + swap |
| `ufw status verbose` | Regras de firewall |

## Otimizações (2 OCPU / 12GB)

| Config | Valor | Motivo |
|--------|-------|--------|
| `WORKER_THREADS_SERVER` | 2 | Aproveitar 2 OCPUs |
| `ENABLE_PERF_THREADING_ARGS` | true | Threads de performance |
| `BACKUP_CRON_EXPRESSION` | `0 4 * * *` | Backup às 4am |
| `AUTO_UPDATE_ENABLED` | true | Updates automáticos |

- Swap de 8GB + `vm.swappiness=10`
- Tuning de kernel UDP para latência baixa
- Limite de RAM do Docker: 10GB para o servidor

## Observações importantes

- `network_mode: host` no manager → compartilha rede do host, `REST_API_HOST` deve
  ser `127.0.0.1`
- Docker socket montado em `/var/run/docker.sock` para `docker start/stop` de
  dentro do container
- `.env.example` e `.env.docker.example` não contêm senhas reais — seguros para
  versionar
