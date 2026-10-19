# Somma — Backend v1

PWA de apoio colaborativo com integração ao Supabase para contas, pedidos, contribuições **simuladas**, histórico e notificações. Implementação e QA controlada concluídas; a branch remota de revisão `somma/backend-v1-integration` foi criada com sucesso. **PR nº 1 em draft, sem merge; publicação na `main` ainda pendente.**

**Não processa dinheiro real.** Não há Pix, carteira, repasse ou cobrança. Os usuários precisam de cadastro real no Supabase; dados e senhas da demonstração local não são importados.

## Preparação

1. Conferir o projeto e os checkpoints em [docs/SETUP_BACKEND_V1.md](docs/SETUP_BACKEND_V1.md).
2. Em `config.js`, usar somente a URL do projeto e a chave pública publishable. Nunca incluir `service_role`, senha de banco ou token administrativo.
3. Login no Dashboard concluído; Site URL salvo como `https://sommaapp.github.io/` e allowlist com exatamente essa URL (1 entrada). Custom SMTP da Brevo e os modelos de confirmação e recuperação foram salvos e conferidos após recarregamento. Manter a confirmação de e-mail ativa.
4. Para abrir localmente, servir a raiz por HTTP, por exemplo `python3 -m http.server 8080 --bind 127.0.0.1`, e acessar `http://localhost:8080/`.

## Dependências e verificação

Com Node.js 22 ou superior:

```bash
npm ci --prefix tooling --ignore-scripts --no-audit --no-fund
npm --prefix tooling run vendor:check
npm --prefix tooling run test:logic
```

O SDK Supabase é distribuído em `vendor/`, fixado em **2.118.0**, acompanhado de licença, avisos e proveniência. `vendor:sync` reproduz essa cópia a partir do pacote oficial. Os testes de navegador usam Playwright **1.62.1** e aceitam `SOMMA_CHROMIUM_EXECUTABLE`; consulte o guia técnico para execução e limites.

## Revisão no GitHub

O **ChatGPT Codex Connector** foi instalado na organização `sommaapp` (ID `172255507`), com seleção `selected` restrita a `sommaapp/sommaapp.github.io`. A UI exibiu leitura de checks/status/metadados e leitura/escrita de actions/code/issues/PR/workflows; a instalação foi confirmada também pelo MCP.

A criação da branch remota `somma/backend-v1-integration` foi concluída pelo MCP sobre a base `619ab2f4ea5ef337dbe06b16068dfe9dd117ae1a`, confirmando escrita efetiva. O erro 403 inicial foi resolvido. Acompanhar o PR associado à branch de revisão e os critérios do guia técnico antes da publicação na `main`.

## Estado da validação

O banco tem quatro migrações aplicadas, Security Advisor sem avisos e **56/56 verificações SQL sequenciais aprovadas**, com rollback dos dados de teste. Frontend: **18/18 testes de lógica e 19/19 testes Chromium**, zero exceções JavaScript e layouts móveis/desktop inspecionados.

Na QA, o SDK era real, as chamadas Auth/Data API foram interceptadas localmente e o service worker estava bloqueado. Concorrência entre sessões, liberação do envio transacional na Brevo, rastreamento/reescrita dos links, entrega de e-mail e autenticação de ponta a ponta continuam com pendências registradas no guia. **PWA instalado e testes reais em iPhone/Safari e Android/Chrome permanecem pendentes.**

As políticas RLS e as regras de limites, privacidade, prazo, idempotência e taxa devem permanecer no servidor. A confirmação de e-mail não equivale à verificação de identidade.
