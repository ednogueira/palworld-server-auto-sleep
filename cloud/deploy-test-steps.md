# Deploy e Teste no Oracle Cloud Ubuntu ARM64

## 1. Preparar artefatos para copiar

O Docker build roda na própria instância ARM64 dentro do container, então precisamos dos fontes:

```bash
# Build local opcional (não obrigatório - o Docker build gera o dist)
npm install
npm run build
```

## 2. Copiar artefatos para a instância

```bash
# No seu Windows (PowerShell com SCP)
scp -r .\src\ ubuntu@joga10.duckdns.org:/opt/palworld/auto-manager/
scp -r .\cloud\ ubuntu@joga10.duckdns.org:/opt/palworld/auto-manager/
scp .\package.json .\tsconfig.json ubuntu@joga10.duckdns.org:/opt/palworld/auto-manager/

# Opcional: dist/ acelera se quiser pular o build no Docker
scp -r .\dist\ ubuntu@joga10.duckdns.org:/opt/palworld/auto-manager/
```

## 3. Na instância — preparar ambiente

```bash
ssh ubuntu@joga10.duckdns.org
sudo mkdir -p /opt/palworld/auto-manager
cd /opt/palworld/auto-manager

# Criar .env do manager a partir do template
cp cloud/.env.docker.example .env

# Editar .env com as credenciais reais
nano .env
```

**Atenção:** o `.env` deve ficar dentro da pasta `cloud/` (onde está o `docker-compose.full.yml`):

```bash
# O .env criado acima está em /opt/palworld/auto-manager/.env
# Copie para dentro de cloud/ onde o compose espera encontrar:
cp .env cloud/.env
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
SERVER_STARTUP_TIMEOUT_SECONDS=300
SERVER_SHUTDOWN_TIMEOUT_SECONDS=90
WAKE_COOLDOWN_SECONDS=30
LOG_LEVEL=info
```

## 4. Copiar compose e Dockerfile para /opt/palworld

```bash
sudo cp cloud/docker-compose.full.yml /opt/palworld/
sudo cp cloud/Dockerfile.manager /opt/palworld/
```

## 5. Subir os containers

Com o palworld-server já rodando (`docker ps`), suba o manager:

```bash
cd /opt/palworld
sudo docker compose -f cloud/docker-compose.full.yml up -d palworld-auto-manager
```

## 6. Verificar logs

```bash
sudo docker logs -f palworld-auto-manager
```

## 7. Testar cenários

### Cenário A — Servidor já rodando
- Manager detecta servidor em execução e entra em modo monitoramento
- Log esperado: `[RUNNING] Servidor ja estava em execucao.`

### Cenário B — Idle timeout
- Pare o servidor: `docker stop palworld-server`
- O manager detecta parada inesperada e ativa o wake listener
- Log esperado: `[STOPPED] Servidor parou inesperadamente.` seguido de `[STOPPED] Wake listener ativo`

### Cenário C — Wake via UDP
- Com o servidor parado e manager escutando, peça a um jogador para tentar conectar
- Manager recebe pacote UDP 8211 e inicia o servidor
- Log esperado: `[WAKE] Pacote recebido` → `[STARTING] Iniciando servidor` → `[RUNNING] Servidor disponivel`

## 8. Opcional — systemd para boot automático

```bash
# Corrigir WorkingDirectory para o caminho real (auto-manager/)
sudo sed -i 's|/opt/palworld|/opt/palworld/auto-manager|' cloud/palworld-auto-manager.service

sudo cp cloud/palworld-auto-manager.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable palworld-auto-manager
sudo systemctl start palworld-auto-manager
```

## 9. Rollback

Se algo der errado, o compose é independente:

```bash
# Parar o manager
sudo docker compose -f cloud/docker-compose.full.yml down palworld-auto-manager

# O palworld-server continua rodando normalmente
# Volte a usar o modo native-windows no Windows local sem alterações
```

## Observações importantes

- `network_mode: host` significa que o manager compartilha a rede do host. O `REST_API_HOST` deve ser `127.0.0.1` (não o nome do container).
- O Docker socket é montado em `/var/run/docker.sock` para permitir `docker start/stop` de dentro do container.
- O build do manager é multi-stage e usa `node:22-alpine`. Na primeira execução o `docker compose up` fará o build automaticamente.
- Mantenha o `.env.example` da raiz para Windows e o `cloud/.env.docker.example` para o modo cloud — os dois templates estão versionados no repositório.
