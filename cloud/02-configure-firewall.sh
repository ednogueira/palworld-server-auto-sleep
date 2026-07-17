#!/usr/bin/env bash
#
# 02-configure-firewall.sh
# Configura o UFW (firewall) da instância para o Palworld Dedicated Server.
#
# Portas liberadas:
#   22/tcp    - SSH             (acesso administrativo)
#   8211/udp  - Jogo Palworld   (público, jogadores conectam aqui)
#   27015/udp - Query Steam     (público, lista de servidores)
#
# Portas BLOQUEADAS externamente (acesso interno apenas):
#   8212/tcp  - REST API        (só o auto-sleep manager acessa)
#   25575/tcp - RCON            (só administração local)
#   80/tcp    - HTTP nginx      (reservado para Fase 3 - Angular)
#   443/tcp   - HTTPS nginx     (reservado para Fase 3 - Angular)
#
# Uso:
#   sudo bash 02-configure-firewall.sh
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

if ! command -v ufw &>/dev/null; then
  info "UFW não encontrado. Instalando..."
  apt-get update -y && apt-get install -y ufw
fi

info "Configurando regras do UFW para o Palworld Dedicated Server..."
echo ""

# ---- Regras padrão ---------------------------------------------------------
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
log "Políticas padrão: deny incoming / allow outgoing."

# ---- SSH (essencial, NUNCA bloquear) ---------------------------------------
ufw allow 22/tcp comment 'SSH administrativo'
log "Porta 22/tcp (SSH) liberada."

# ---- Palworld - porta do jogo (público) ------------------------------------
ufw allow 8211/udp comment 'Palworld - porta do jogo'
log "Porta 8211/udp (Palworld jogo) liberada."

# ---- Palworld - query port Steam (público) --------------------------------
ufw allow 27015/udp comment 'Palworld - query port Steam'
log "Porta 27015/udp (Steam query) liberada."

# ---- REST API (INTERNO APENAS - nunca expor) ------------------------------
ufw deny 8212/tcp comment 'Palworld REST API - INTERNO'
log "Porta 8212/tcp (REST API) bloqueada externamente."

# ---- RCON (INTERNO APENAS - nunca expor) -----------------------------------
ufw deny 25575/tcp comment 'Palworld RCON - INTERNO'
log "Porta 25575/tcp (RCON) bloqueada externamente."

# ---- Nginx (reservado para Fase 3 - Angular) -------------------------------
# Comentado por enquanto; descomente quando o frontend Angular estiver pronto.
# ufw allow 80/tcp comment 'nginx HTTP - reservado Fase 3'
# ufw allow 443/tcp comment 'nginx HTTPS - reservado Fase 3'
info "Portas 80/443 (nginx) permanecem configuradas como estão (reservadas para Fase 3)."

# ---- Habilitar UFW ---------------------------------------------------------
ufw --force enable
log "UFW habilitado."

# ---- Resumo ----------------------------------------------------------------
echo ""
echo "================================================================"
echo -e "${GREEN} FIREWALL CONFIGURADO${NC}"
echo "================================================================"
echo ""
echo " Portas liberadas (público):"
echo "   22/tcp     - SSH"
echo "   8211/udp   - Palworld (jogo)"
echo "   27015/udp  - Steam query"
echo ""
echo " Portas bloqueadas externamente (interno apenas):"
echo "   8212/tcp   - REST API"
echo "   25575/tcp  - RCON"
echo ""
echo -e "${YELLOW} ATENÇÃO:${NC}"
echo "   O UFW é apenas o firewall do SO."
echo "   Você também precisa liberar 8211/udp e 27015/udp nas"
echo "   Security Lists / NSGs do Oracle Cloud (console web)."
echo "   Consulte: oracle-security-lists.md"
echo ""
echo "================================================================"
echo ""
info "Status atual do UFW:"
ufw status verbose
