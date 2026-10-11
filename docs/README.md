# Documentação do vera-api

A visão geral do repositório está no `README.md` da raiz. As decisões de arquitetura e as convenções (camadas, acesso a dados, filas, testes, observabilidade) vivem nas skills de engenharia da organização, mantidas no repositório `.github` e sincronizadas para `.claude/skills/` pelo card #29. Até a sincronização chegar, a fonte das regras é o próprio `eslint.config.mjs`, que impõe as fronteiras de camada, zero comentários e a ausência de `else`.
