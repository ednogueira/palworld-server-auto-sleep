#!/usr/bin/env bash
#
# 03-restore-save.sh
# Restaura o save do Palworld migrado do Windows para o novo hash do servidor Linux.
#
# Fluxo:
#   1. Verifica se o save antigo (do Windows) foi transferido para /opt/palworld/save-backup/
#   2. Sobe o servidor uma vez para gerar o hash novo e estrutura de pastas
#   3. Para o servidor
#   4. Copia os arquivos de save do hash antigo para dentro da pasta do hash novo
#   5. Ajusta o DedicatedServerName em GameUserSettings.ini para o novo hash
#   6. Libera o usuário para re-subir o servidor
#
# PRÉ-REQUISITO:
#   - O save do Windows deve ter sido transferido para:
#       /opt/palworld/save-backup/F8C5770D4ED1F3EF6D90BBB274D20CA0/
#     (Use o backup-save-windows.ps1 no Windows para gerar e enviar o save)
#
# Uso:
#   sudo bash 03-restore-save.sh
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC}   $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
info() { echo -e "${CYAN}[INFO]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC}  $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "Execute como root (use: sudo bash $0)"
  exit 1
fi

# ---- Variáveis --------------------------------------------------------------
PALWORLD_DIR="/opt/palworld"
DATA_DIR="$PALWORLD_DIR/palworld-data"
SAVE_DIR="$DATA_DIR/Pal/Saved/SaveGames/0"
BACKUP_DIR="$PALWORLD_DIR/save-backup"

# Hash antigo (do servidor Windows - confirmado pelo usuário)
OLD_HASH="F8C5770D4ED1F3EF6D90BBB274D20CA0"
OLD_SAVE_PATH="$BACKUP_DIR/$OLD_HASH"

# ---- Validações iniciais ----------------------------------------------------
if [[ ! -d "$PALWORLD_DIR" ]]; then
  err "Diretório $PALWORLD_DIR não existe. Execute 01-prepare-instance.sh primeiro."
  exit 1
fi

if [[ ! -f "$PALWORLD_DIR/docker-compose.yml" ]]; then
  err "$PALWORLD_DIR/docker-compose.yml não encontrado. Deposite o compose e .env primeiro."
  exit 1
fi

echo ""
echo "================================================================"
echo -e "${CYAN} Restauração de Save - Palworld Server${NC}"
echo "================================================================"
echo ""
echo " Hash antigo (Windows): $OLD_HASH"
echo " Save backup em:        $OLD_SAVE_PATH"
echo " Save destino:          $SAVE_DIR/<hash_novo>/"
echo ""

# ---- Passo 1: Verificar se o backup do save existe --------------------------
if [[ ! -d "$OLD_SAVE_PATH" ]]; then
  err "Save antigo não encontrado em: $OLD_SAVE_PATH"
  echo ""
  warn "Você precisa transferir o save do Windows primeiro."
  warn "No Windows, rode backup-save-windows.ps1 para gerar o arquivo."
  warn "Depois envie via scp para a instância:"
  echo ""
  echo "   # No Windows (PowerShell):"
  echo "   scp -r C:\\palworld-save-backup ubuntu@<IP_DA_INSTANCIA>:/opt/palworld/save-backup/"
  echo ""
  echo "   # Ou se já compactou em .zip:"
  echo "   scp palworld-save.zip ubuntu@<IP>:/opt/palworld/"
  echo "   ssh ubuntu@<IP> 'cd /opt/palworld && unzip palworld-save.zip -d save-backup'"
  echo ""
  exit 1
fi
log "Save antigo encontrado em $OLD_SAVE_PATH."
echo "   Conteúdo:"
ls -la "$OLD_SAVE_PATH" | head -20
echo ""

# ---- Passo 2: Subir o servidor uma vez para gerar o hash novo ---------------
info "Subindo o servidor uma vez para gerar o hash novo e estrutura de pastas..."
echo "   (Isso pode levar alguns minutos)"
echo ""

cd "$PALWORLD_DIR"
docker compose up -d

# Aguardar até que a pasta de SaveGames exista
info "Aguardando o servidor criar a estrutura de SaveGames..."
MAX_WAIT=300
WAITED=0
while [[ ! -d "$SAVE_DIR" ]]; do
  sleep 10
  WAITED=$((WAITED + 10))
  if [[ $WAITED -ge $MAX_WAIT ]]; then
    err "Timeout aguardando a pasta $SAVE_DIR ser criada ($MAX_WAIT s)."
    warn "Verifique os logs: docker compose logs palworld-server"
    exit 1
  fi
  printf "\r   Aguardando... %ds" "$WAITED"
done
echo ""
log "Estrutura de SaveGames criada em $SAVE_DIR."

# Aguardar mais um pouco para garantir que o servidor registrou o hash
info "Aguardando 30s para garantir que o hash foi registrado..."
sleep 30

# ---- Passo 3: Detectar o hash novo -----------------------------------------
info "Detectando o hash novo gerado pelo servidor..."
# O hash novo é a pasta dentro de SaveGames/0/ (ignora backups, arquivos soltos)
NEW_HASH=""
for dir in "$SAVE_DIR"/*/; do
  dirname=$(basename "$dir")
  # Validar formato: 32 caracteres hexadecimais
  if [[ "$dirname" =~ ^[A-Fa-f0-9]{32}$ ]]; then
    NEW_HASH="$dirname"
    break
  fi
done

if [[ -z "$NEW_HASH" ]]; then
  err "Não foi possível detectar o hash novo em $SAVE_DIR."
  warn "Pastas encontradas:"
  ls -la "$SAVE_DIR" 2>/dev/null || echo "   (vazio)"
  warn "Pode ser que o servidor ainda não tenha gerado o hash. Tente novamente em 1 min."
  exit 1
fi

NEW_SAVE_PATH="$SAVE_DIR/$NEW_HASH"
log "Hash novo detectado: $NEW_HASH"
echo ""

# ---- Passo 4: Parar o servidor ---------------------------------------------
info "Parando o servidor para restaurar o save com segurança..."
docker compose stop palworld-server
log "Servidor parado."
echo ""

# ---- Passo 5: Backup de segurança do save novo (vazio, mas por precaução) ----
NEW_BACKUP="$NEW_SAVE_PATH"_backup_before_restore_$(date +%s)
if [[ -d "$NEW_SAVE_PATH" ]]; then
  cp -r "$NEW_SAVE_PATH" "$NEW_BACKUP"
  log "Backup de segurança do save novo criado em: $NEW_BACKUP"
fi

# ---- Passo 6: Copiar arquivos do hash antigo para o hash novo ---------------
info "Copiando arquivos de save do hash antigo para o hash novo..."
echo "   Origem:  $OLD_SAVE_PATH/"
echo "   Destino: $NEW_SAVE_PATH/"
echo ""

cp -rv "$OLD_SAVE_PATH"/* "$NEW_SAVE_PATH"/ 2>&1 | while read -r line; do
  printf "   %s\n" "$line"
done
log "Arquivos de save copiados."
echo ""

# Ajustar permissões para o usuário do container (PUID/PGID 1000)
chown -R 1000:1000 "$DATA_DIR" 2>/dev/null || true
log "Permissões ajustadas (1000:1000) em $DATA_DIR."

# ---- Passo 7: Ajustar DedicatedServerName em GameUserSettings.ini -----------
GUS_INI="$DATA_DIR/Pal/Saved/Config/LinuxServer/GameUserSettings.ini"
if [[ -f "$GUS_INI" ]]; then
  info "Ajustando DedicatedServerName em GameUserSettings.ini..."
  # Backup do arquivo original
  cp "$GUS_INI" "${GUS_INI}.backup_restore"

  # Substituir o DedicatedServerName pelo hash novo
  if grep -q "^DedicatedServerName=" "$GUS_INI"; then
    sed -i "s/^DedicatedServerName=.*/DedicatedServerName=$NEW_HASH/" "$GUS_INI"
  else
    echo "DedicatedServerName=$NEW_HASH" >> "$GUS_INI"
  fi
  log "DedicatedServerName definido para $NEW_HASH."
else
  warn "GameUserSettings.ini não encontrado em: $GUS_INI"
  warn "Isso é normal se o servidor não completou o boot. Ajuste manual pode ser necessário."
fi
echo ""

# ---- Passo 8: Resumo -------------------------------------------------------
echo "================================================================"
echo -e "${GREEN} RESTAURAÇÃO DE SAVE CONCLUÍDA${NC}"
echo "================================================================"
echo ""
echo " Resumo da migração:"
echo "   Hash antigo (Windows): $OLD_HASH"
echo "   Hash novo (Linux):     $NEW_HASH"
echo "   Save restaurado em:    $NEW_SAVE_PATH"
echo "   Backup de segurança:   $NEW_BACKUP"
echo ""
echo -e "${YELLOW} PRÓXIMOS PASSOS:${NC}"
echo ""
echo "   1. Re-subir o servidor:"
echo "        cd $PALWORLD_DIR"
echo "        docker compose up -d"
echo ""
echo "   2. Acompanhar os logs:"
echo "        docker compose logs -f palworld-server"
echo ""
echo "   3. Validar conectando um jogador e conferindo:"
echo "        - Bases, Pals, progresso intactos"
echo "        - Save carregou corretamente"
echo ""
echo -e "${YELLOW}   4. IMPORTANTE para os jogadores:${NC}"
echo "      Cada jogador precisará rodar o update-map.ps1 no próprio"
echo "      PC Windows para migrar o mapa do hash antigo para o novo:"
echo "        Hash antigo: $OLD_HASH"
echo "        Hash novo:   $NEW_HASH"
echo ""
echo "================================================================"
