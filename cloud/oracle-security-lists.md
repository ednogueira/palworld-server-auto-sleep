# Oracle Cloud — Liberação de Portas (Security Lists / NSGs)

A Oracle Cloud tem **dois níveis de firewall**:

1. **UFW na instância** — configurado por `02-configure-firewall.sh`
2. **Security Lists / NSGs na VCN** — configurado via **console web da Oracle Cloud**

Mesmo que o UFW libere uma porta, se a Security List da VCN não liberar, o tráfego
não chega à instância. **Você precisa configurar ambos.**

## Passo a passo no console da Oracle Cloud

### 1. Acessar a VCN

1. Acesse [cloud.oracle.com](https://cloud.oracle.com)
2. Vá em **Networking → Virtual Cloud Networks**
3. Clique na **VCN** que sua instância usa
   - Se não souber qual é: vá em **Compute → Instances**, clique na sua instância e veja a VCN na seção "Attached VNICs"

### 2. Encontrar a Security List

1. Na página da VCN, clique em **Security Lists** (menu lateral esquerdo)
2. Você verá uma ou mais Security Lists. Clique na **Default Security List** da VCN
   - Geralmente tem nome como `Default Security List for <nome-da-vcn>`

> **Alternativa: Network Security Groups (NSGs)**
> Se você usa NSGs em vez de Security Lists, vá em **Network Security Groups**
> e adicione as regras abaixo na NSG anexada à sua instância.

### 3. Adicionar regras de Ingress

Clique em **Add Ingress Rules** e adicione **cada regra** abaixo:

#### Regra 1 — Porta do jogo Palworld (8211/UDP)

| Campo | Valor |
|-------|-------|
| Source CIDR | `0.0.0.0/0` |
| IP Protocol | `UDP` |
| Destination Port Range | `8211` |
| Description | `Palworld - porta do jogo (UDP)` |
| Stateless | ❌ (deixe desmarcado) |

#### Regra 2 — Query port Steam (27015/UDP)

| Campo | Valor |
|-------|-------|
| Source CIDR | `0.0.0.0/0` |
| IP Protocol | `UDP` |
| Destination Port Range | `27015` |
| Description | `Steam query port (UDP)` |
| Stateless | ❌ (deixe desmarcado) |

#### Regra 3 — SSH (provavelmente já existe)

| Campo | Valor |
|-------|-------|
| Source CIDR | `0.0.0.0/0` (ou restrinja ao seu IP) |
| IP Protocol | `TCP` |
| Destination Port Range | `22` |
| Description | `SSH` |

### ⚠️ Portas que NÃO devem ser liberadas

**NÃO adicione regras de Ingress para estas portas** — elas devem ficar acessíveis apenas internamente:

| Porta | Protocolo | Serviço | Por quê |
|-------|-----------|---------|---------|
| `8212` | TCP | REST API | Contém credenciais admin; só o auto-sleep manager acessa |
| `25575` | TCP | RCON | Comando admin remoto; só acesso local |

## Resumo final das regras

Após configurar, a Security List deve ter (mínimo):

| Source CIDR | Protocol | Port | Descrição |
|-------------|----------|------|-----------|
| `0.0.0.0/0` | TCP | 22 | SSH |
| `0.0.0.0/0` | UDP | 8211 | Palworld jogo |
| `0.0.0.0/0` | UDP | 27015 | Steam query |

## Verificação

Para confirmar que as portas estão acessíveis externamente, **de fora da instância** (do seu PC):

```bash
# Teste UDP 8211 (se responder, está aberta)
nc -u -v <IP_DA_INSTANCIA> 8211

# Teste UDP 27015
nc -u -v <IP_DA_INSTANCIA> 27015
```

Ou use um testador online de portas UDP como [portchecktool.com](https://portchecktool.com).

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Jogadores não conseguem conectar | Verifique Security List + UFW |
| Conexão cai ao reiniciar instância | IP efêmero mudou — configure DuckDNS |
| Servidor não aparece na lista Steam | Não aparece mesmo (`COMMUNITY=false`). Jogadores conectam por IP/DNS direto |
| Não pinga (ICMP) | Oracle Cloud bloqueia ICMP por padrão. Normal |

## Nota sobre Egress (Saída)

Por padrão, a Security List da Oracle já permite **toda a saída** (Egress `0.0.0.0/0`).
O servidor precisa de saída para:
- Baixar o jogo via Steam (UDP/TCP)
- Comunicar-se com servidores Steam (27015 UDP)
- Acessar DuckDNS (HTTPS)

Se você restringiu Egress, libere saída para a internet.
