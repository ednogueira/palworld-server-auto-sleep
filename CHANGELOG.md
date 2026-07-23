# Changelog

Todas as mudancas relevantes deste projeto sao documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere a [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [1.0.2] - 2026-07-23

### Fixed
- `README.md`: badge de versão atualizada de `1.0.0` para `1.0.2` (estava
  apontando para release inexistente).
- `README.md`: diagrama de arquitetura corrigido — `src/index.ts` está na
  raiz de `src/` (não em `entrypoints/`) e chama `bootstrap()` de
  `src/entrypoints/bootstrap.ts`.
- `README.md`: caminho do `update-map.ps1` corrigido de `.\update-map.ps1`
  para `.\scripts\update-map.ps1`.
- `docs/architecture/overview.md`: removida referência a
  `src/entrypoints/index.ts` (arquivo deletado na v1.0.0).
- `AGENTS.md`: diretriz de versionamento agora exige atualizar a badge de
  versão no `README.md` a cada bump.

### Added
- `LICENSE`: adicionado arquivo MIT (necessário para a badge de licenca
  apontar para arquivo valido).

## [1.0.1] - 2026-07-23

### Changed
- `AGENTS.md`: adicionada diretriz de versionamento SemVer exigindo bump
  de versão em `package.json` a cada commit, com atualizacao do
  `CHANGELOG.md` e tag Git correspondente.

## [1.0.0] - 2026-07-23

### Added
- Modo de operacao `docker` para controlar o servidor Palworld via Docker CLI
  + REST API (alem do modo `native-windows` ja existente).
- Adapter `ServerProcessDriver` com implementacoes para Windows nativo e Docker.
- Adapter `BackupService` com implementacao Docker (`docker exec <container> backup`)
  e stub Noop.
- Wake listener UDP no modo Docker (network_mode host) para acordar o server
  quando o jogador tenta conectar.
- Suite de testes E2E leve em `scripts/test-scenarios/` cobrindo os cenarios
  do ADR-0005 sem dependencia de Docker.
- Scripts operacionais em `cloud/scripts/`: `backup-save.sh`,
  `tag-manager-image.sh`, `rollback-manager.sh` (uso local, nao versionados).
- CHANGELOG.md e politica de versionamento SemVer (ADR-0006).

### Changed
- Entrypoint unificado em `src/index.ts` (remove `src/entrypoints/main.ts`).
- `ProcessManager` agora aceita callback `shouldAbort` para cancelar shutdown
  caso um jogador conecte durante o backup.
- `IdleMonitor` ganha metodo `restart()` para reiniciar o timer quando o
  servidor volta a rodar.
- Bootstrap (`src/entrypoints/bootstrap.ts`) chama `idleMonitor.restart()` em
  todo ponto de entrada RUNNING e usa `createAbortCheck()` durante o shutdown.
- Politica de restart do container do server alterada para `on-failure` no
  Docker Compose.
- Documentacao de deploy consolidada em `cloud/README.md` e
  `docs/runbooks/update-environment.md` (este ultimo nao versionado).
- `.gitignore` ampliado para proteger secrets, chaves, backups e diretorios
  de operacao local (`docs/runbooks/`, `cloud/scripts/`).

### Fixed
- Loop de shutdown/restart do servidor causado por bug no entrypoint
  (chamava `result.shutdown()` imediatamente apos `bootstrap()` resolver).
- Execucao de testes com entrypoint que mantem processo vivo (Vitest
  `forceExit: true` em `vitest.config.ts`).
- Documentacao referenciando arquivos inexistentes (`cloud/deploy-test-steps.md`).

### Security
- Mascaramento de dados sensiveis em documentacao publica: IPs, dominios
  DuckDNS, hashes de save, caminhos de chaves SSH, nome de servidor.
- Scripts obsoletos de deploy removidos (`cloud/deploy-manager.sh`,
  `cloud/deploy-manager.ps1`, `cloud/DEPLOY.md`).

[Unreleased]: https://github.com/ednogueira/palworld-server-auto-sleep/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ednogueira/palworld-server-auto-sleep/releases/tag/v1.0.0
