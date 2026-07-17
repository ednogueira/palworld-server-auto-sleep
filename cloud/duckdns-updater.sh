#!/usr/bin/env bash
#
# duckdns-updater.sh
# Atualiza o IP público da instância no DuckDNS (DNS dinâmico gratuito).
#
# Resolve o problema do IP efêmero da Oracle Cloud: quando a instância reinicia,
# o IP público pode mudar. Este script atualiza o DuckDNS a cada 5 minutos
# via cron para que os jogadores sempre usem <subdominio>.duckdns.org para
# conectar.
#
# PRÉ-REQUISITO:
#   1. Acesse https://www.duckdns.org
#   2. Faça login (GitHub/Google/etc.)
#   3. Crie um subdomínio (ex.: joga10)
#   4. Anote o TOKEN exibido na página
#   5. Preencha DUCKDNS_DOMAIN e DUCKDNS_TOKEN abaixo (ou via /opt/palworld/.duckdns)
#
# Instalação (cron):
#   sudo bash duckdns-updater.sh --install
#
# Execução manual (teste):
#   sudo bash duckdns-updater.sh
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

# ---- Configurações ----------------------------------------------------------
# Pode sobrescrever via arquivo /opt/palworld/.duckdns
DUCKDNS_DOMAIN="${DUCKDNS_DOMAIN:-joga10}"
DUCKDNS_TOKEN="${DUCKDNS_TOKEN:-coloque-seu-token-aqui}"

DUCKDNS_CONF="/opt/palworld/.duckdns"
if [[ -f "$DUCKDNS_CONF" ]]; then
  source "$DUCKDNS_CONF"
fi

# ---- Modo de instalação (cron) ---------------------------------------------
if [[ "${1:-}" == "--install" ]]; then
  if [[ $EUID -ne 0 ]]; then
    err "Execute --install como root (sudo bash $0 --install)."
    exit 1
  fi

  if [[ "$DUCKDNS_TOKEN" == "coloque-seu-token-aqui" ]]; then
    err "Antes de instalar, edite este script (ou /opt/palworld/.duckdns) e defina:"
    err "   DUCKDNS_DOMAIN=seu_subdominio"
    err "   DUCKDNS_TOKEN=seu_token_do_duckdns"
    exit 1
  fi

  info "Instalando cron do DuckDNS..."

  # Salvar config
  mkdir -p /opt/palworld
  cat > "$DUCKDNS_CONF" <<EOF
DUCKDNS_DOMAIN=$DUCKDNS_DOMAIN
DUCKDNS_TOKEN=$DUCKDNS_TOKEN
EOF
  chmod 600 "$DUCKDNS_CONF"
  log "Configuração salva em $DUCKDNS_CONF."

  SCRIPT_PATH=$(readlink -f "$0")
  CRON_LINE="*/5 * * * * root bash $SCRIPT_PATH >> /var/log/duckdns.log 2>&1"

  # Adicionar ao cron (sistema) se ainda não existir
  if [[ -f /etc/crontab ]]; then
    if ! grep -q "duckdns-updater.sh" /etc/crontab; then
      echo "$CRON_LINE" >> /etc/crontab
      log "Cron adicionado em /etc/crontab (a cada 5 minutos)."
    else
      log "Cron já existe em /etc/crontab."
    fi
  else
    # Fallback: cron.d
    echo "$CRON_LINE" > /etc/cron.d/duckdns
    chmod 644 /etc/cron.d/duckdns
    log "Cron adicionado em /etc/cron.d/duckdns (a cada 5 minutos)."
  fi

  # Log rotation
  if [[ -f /etc/logrotate.d/duckdns ]]; then
    log "Logrotate já configurado."
  else
    cat > /etc/logrotate.d/duckdns <<'EOF'
/var/log/duckdns.log {
    monthly
    missingok
    rotate 3
    compress
    delaycompress
    notifempty
    create
}
EOF
    log "Logrotate configurado para /var/log/duckdns.log."
  fi

  echo ""
  echo "================================================================"
  echo -e "${GREEN} DuckDNS instalado!${NC}"
  echo "================================================================"
  echo ""
  echo " Domínio:   $DUCKDNS_DOMAIN.duckdns.org"
  echo " Token:     ${DUCKDNS_TOKEN:0:8}... (ocultado)"
  echo " Cron:      a cada 5 minutos"
  echo " Log:       /var/log/duckdns.log"
  echo ""
  echo " Jogadores conectam em:"
  echo "   $DUCKDNS_DOMAIN.duckdns.org:8211"
  echo ""
  echo " Teste manual agora:"
  echo "   sudo bash $0"
  echo "================================================================"
  exit 0
fi

# ---- Execução da atualização ------------------------------------------------
if [[ "$DUCKDNS_TOKEN" == "coloque-seu-token-aqui" ]]; then
  err "Token do DuckDNS não configurado."
  err "Edite este script ou crie /opt/palworld/.duckdns com:"
  err "   DUCKDNS_DOMAIN=seu_subdominio"
  err "   DUCKDNS_TOKEN=seu_token"
  err "Depois rode: sudo bash $0 --install"
  exit 1
fi

URL="https://www.duckdns.org/update?domains=$DUCKDNS_DOMAIN&token=$DUCKDNS_TOKEN&ip="

info "Atualizando DuckDNS: $DUCKDNS_DOMAIN.duckdns.org"

RESPONSE=$(curl -s --max-time 30 "$URL" || echo "FAILED")

if [[ "$RESPONSE" == "OK" ]]; then
  log "DuckDNS atualizado com sucesso. ($RESPONSE)"
  # Log com timestamp
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK - $DUCKDNS_DOMAIN.duckdns.org atualizado."
else
  warn "DuckDNS respondeu: '$RESPONSE'"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN - Resposta: $RESPONSE"
fi

# Exibir IP atual pra confirmação
PUBLIC_IP=$(curl -s --max-time 10 https://ifconfig.me 2>/dev/null || echo "não detectado")
info "IP público atual da instância: $PUBLIC_IP"
info "URL de conexão dos jogadores:   $DUCKDNS_DOMAIN.duckdns.org:8211"
