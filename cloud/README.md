# Palworld Dedicated Server - Migração para Oracle Cloud (Fase 1)

Este diretório contém os scripts e configurações para migrar o servidor dedicado de Palworld do Windows local para uma instância Ubuntu ARM64 na Oracle Cloud usando Docker.

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `01-prepare-instance.sh` | Prepara a instância: instala Docker, cria swap, tuning de kernel |
| `02-configure-firewall.sh` | Configura o UFW com as portas corretas |
| `docker-compose.yml` | Define o container do Palworld Server |
| `.env.example` | Template de configuração (copiar para `.env` e editar) |
| `03-restore-save.sh` | Restaura o save migrado do Windows para o novo hash |
| `backup-save-windows.ps1` | Compacta e envia o save do Windows via SCP |
| `duckdns-updater.sh` | Configura DNS dinâmico (DuckDNS) para IP efêmero |
| `oracle-security-lists.md` | Instruções para liberar portas no console da Oracle |

## Pré-requisitos

- Instância Ubuntu ARM64 na Oracle Cloud (2 OCPU / 12GB RAM free tier)
- Acesso SSH à instância
- Save atual do Palworld no Windows em:
  ```
  C:\Program Files (x86)\Steam\steamapps\common\PalServer\Pal\Saved\SaveGames\0\F8C5770D4ED1F3EF6D90BBB274D20CA0\
  ```
- Chave SSH (.pem) para acessar a instância

## Passo a Passo

### Passo 1 — Preparar a instância

Na instância (via SSH), suba os arquivos `cloud/` e execute:

```bash
# Transferir os arquivos (do seu computador)
scp -r cloud/ ubuntu@<IP_DA_INSTANCIA>:/tmp/

# Na instância
ssh ubuntu@<IP_DA_INSTANCIA>
sudo bash /tmp/cloud/01-prepare-instance.sh
```

### Passo 2 — Depositar configuração

```bash
sudo mkdir -p /opt/palworld
sudo cp /tmp/cloud/docker-compose.yml /opt/palworld/
sudo cp /tmp/cloud/.env.example /opt/palworld/.env
sudo cp /tmp/cloud/02-configure-firewall.sh /opt/palworld/
sudo cp /tmp/cloud/03-restore-save.sh /opt/palworld/
sudo cp /tmp/cloud/duckdns-updater.sh /opt/palworld/

# EDITAR o .env com sua senha real
sudo nano /opt/palworld/.env
```

**Obrigatório:** Edite o `.env` e substitua `ADMIN_PASSWORD=trocar-por-senha-forte` pela sua senha real (a mesma que você usa no auto-sleep manager). O servidor NÃO funciona sem isso.

O `.env.example` na pasta `cloud/` NÃO contém senhas reais — é seguro versionar no git.

### Passo 3 — Configurar firewall

```bash
sudo bash /opt/palworld/02-configure-firewall.sh
```

### Passo 4 — Liberar portas no console da Oracle Cloud

**Esta etapa NÃO é feita via SSH.** Acesse o console web da Oracle Cloud:

1. Vá em **Networking → Virtual Cloud Networks**
2. Clique na VCN da sua instância
3. Vá em **Security Lists** (ou **Network Security Groups**)
4. Adicione as seguintes regras de Ingress:

| Source | Protocol | Port | Descrição |
|--------|----------|------|-----------|
| `0.0.0.0/0` | UDP | 8211 | Palworld jogo |
| `0.0.0.0/0` | UDP | 27015 | Steam query |

5. **NÃO** libere as portas 8212 (REST API) nem 25575 (RCON) externamente.

Veja detalhes em `oracle-security-lists.md`.

### Passo 5 — Configurar DNS dinâmico (DuckDNS)

Como o IP da instância é efêmero, configuramos o DuckDNS para que os amigos conectem via `joga10.duckdns.org:8211`:

1. Acesse [duckdns.org](https://www.duckdns.org)
2. Faça login e crie um subdomínio (ex.: `joga10`)
3. Anote o **token** exibido na página
4. Na instância:

```bash
# Editar o script com seu token
sudo nano /opt/palworld/duckdns-updater.sh
# Modificar as linhas:
#   DUCKDNS_DOMAIN="joga10"
#   DUCKDNS_TOKEN="seu-token-aqui"

# OU criar arquivo de config:
sudo tee /opt/palworld/.duckdns << 'EOF'
DUCKDNS_DOMAIN=joga10
DUCKDNS_TOKEN=seu-token-aqui
EOF
sudo chmod 600 /opt/palworld/.duckdns

# Instalar cron
sudo bash /opt/palworld/duckdns-updater.sh --install

# Testar manualmente
sudo bash /opt/palworld/duckdns-updater.sh
```

Os jogadores conectam em: `joga10.duckdns.org:8211`

### Passo 6 — Transferir e restaurar o save

**No Windows (PowerShell):**

```powershell
.\cloud\backup-save-windows.ps1 -InstanceIp <IP_DA_INSTANCIA> -SshKeyPath C:\caminho\para\sua-chave.pem
```

**Na instância (via SSH):**

```bash
sudo bash /opt/palworld/03-restore-save.sh
```

Este script:
1. Verifica se o save do Windows foi transferido para `/opt/palworld/save-backup/`
2. Sobe o servidor pela primeira vez (baixa e instala o Palworld — leva vários minutos)
3. Detecta o hash novo gerado pelo servidor
4. Para o servidor
5. Copia os arquivos de save do hash antigo para o novo
6. Ajusta o `DedicatedServerName` no `GameUserSettings.ini`
7. Exibe o hash novo para os jogadores

Acompanhe os logs durante a execução:

```bash
# Em outro terminal SSH, durante o passo 6:
cd /opt/palworld
sudo docker compose logs -f palworld-server
```

### Passo 7 — Re-subir o servidor e validar

```bash
cd /opt/palworld
sudo docker compose up -d
sudo docker compose logs -f palworld-server
```

Valide:
- [ ] Logs sem erros
- [ ] REST API responde internamente:
  ```bash
  curl -u admin:<ADMIN_PASSWORD> http://127.0.0.1:8212/v1/api/info
  ```
- [ ] Um jogador conecta e vê o mundo correto (bases, Pals, progresso)
- [ ] RAM/CPU dentro do aceitável: `sudo docker stats palworld-server`
- [ ] Conexão via `joga10.duckdns.org:8211` funciona

### Passo 8 — Instruir os jogadores (update-map)

Cada jogador precisará rodar `update-map.ps1` no próprio PC Windows para migrar o mapa do hash antigo para o novo:

```
Hash antigo: F8C5770D4ED1F3EF6D90BBB274D20CA0
Hash novo:   <exibido pelo 03-restore-save.sh>
```

Os jogadores devem:
1. Conectar no novo servidor **uma vez** (para criar a pasta com hash novo)
2. Fechar o Palworld
3. Rodar `update-map.ps1`
4. Reconectar — o mapa estará preservado

## Comandes úteis

| Comando | Descrição |
|---------|-----------|
| `docker compose up -d` | Subir o servidor em background |
| `docker compose down` | Parar o servidor |
| `docker compose restart` | Reiniciar o servidor |
| `docker compose logs -f` | Ver logs em tempo real |
| `docker stats palworld-server` | Monitorar CPU/RAM |
| `docker compose exec palworld-server rcon-cli` | Abrir console RCON |
| `docker compose exec palworld-server backup` | Criar backup manual |
| `free -h` | Ver uso de memória (incluindo swap) |
| `ufw status verbose` | Ver regras de firewall |

## Otimizações aplicadas (2 OCPU / 12GB RAM)

Por estarmos abaixo do mínimo oficial (4 cores / 16GB), as seguintes otimizações foram aplicadas no `.env`:

| Configuração | Valor | Motivo |
|--------------|-------|--------|
| `WORKER_THREADS_SERVER` | 2 | Aproveitar 2 OCPUs |
| `ENABLE_PERF_THREADING_ARGS` | true | Habilitar threads de performance |
| `BACKUP_CRON_EXPRESSION` | `0 4 * * *` | Backup às 4am (baixo uso) |
| `AUTO_UPDATE_ENABLED` | true | Updates automáticos (você pediu para remover version lock) |
| `bENABLE_NON_LOGIN_PENALTY` | true | Penalidade por não login (mantido do seu .ini) |
| `bENABLE_FAST_TRAVEL` | true | Fast travel habilitado (mantido do seu .ini) |

Adicionalmente:
- Swap de 8GB criado para emergências de RAM
- `vm.swappiness=10` (preferir RAM, swap só em emergência)
- Tuning de kernel UDP para latência baixa
- Limites de Docker: servidor usa até 10GB RAM (1GB reservado para SO + auto-manager)

## Próximas fases

- **Fase 2:** Adaptação do auto-sleep manager para Linux/Docker (manterá compatibilidade Windows)
- **Fase 3:** Frontend Angular + nginx reverse proxy + auth
