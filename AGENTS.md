# AGENTS.md do projeto node-ts-service

## Contexto do projeto
Descreva domínio, integrações, comandos úteis, regras de validação e convenções locais.

## Ordem de leitura local
1. Este arquivo.
2. docs/architecture/overview.md
3. docs/decisions/
4. docs/runbooks/
5. Código e testes relacionados.

## Regras locais
- seguir padrão do projeto;
- alterar testes quando comportamento mudar;
- evitar mudanças fora do escopo.
- após implementação de alterações estruturantes e relevantes a arquitetura do projeto atualize `docs/architecture/overview.md`

## Deploy / atualização do ambiente
- Antes de atualizar o ambiente de produção na Oracle Cloud, consulte e siga o runbook local `docs/runbooks/update-environment.md` (não versionado; manter fora do repositório público).
- Sempre peça aprovação explícita do usuário antes de executar sync, build, recriar containers ou restaurar backups.
- Use os scripts em `cloud/scripts/` para operações mecânicas (backup do save, tag de imagem, rollback do manager) — não reimplemente a lógica no shell. Esse diretório é local e não versionado.
- A detecção do que mudou no server usa checksums (`md5sum`), não diff completo, para economizar tokens.

## Registro de decisões
- Avalie se a tarefa introduz ou altera uma decisão arquitetural, operacional ou de engenharia relevante.
- Quando houver impacto estrutural, criar ou atualizar um ADR em `docs/decisions/`.
- Não criar ADR para mudanças triviais, locais ou puramente cosméticas.
- Ao substituir decisão anterior, criar novo ADR com referência ao anterior em vez de apagar histórico.
- Toda decisão registrada deve incluir: contexto, decisão, alternativas, trade-offs e consequências.
- Use o formato toml (Toon) para redução de token
- Considere o template `~/.config/opencode/templates/adr-template.md`

<!-- headroom:rtk-instructions -->
# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix with `rtk`**. This reduces context
usage by 60-90% with zero behavior change. If rtk has no filter for a command,
it passes through unchanged — so it is always safe to use.

## Key Commands
```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) — shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings) — shows errors only
rtk tsc                 rtk lint                rtk cargo build
rtk prettier --check    rtk mypy                rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>          rtk json <file>
rtk summary <cmd>       rtk deps                rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list         rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get         rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install        rtk npm run <script>
```

## Rules
- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use raw command without rtk prefix
- `rtk proxy <cmd>` runs command without filtering but tracks usage
<!-- /headroom:rtk-instructions -->
