SOMMA — BACKEND V1

PWA de apoio colaborativo integrada ao Supabase para contas, pedidos,
contribuições simuladas, histórico e notificações. Implementação e QA controlada
concluídas; a branch remota de revisão somma/backend-v1-integration foi criada
com sucesso. PR nº 1 em draft, sem merge; publicação na main ainda pendente.

Não processa dinheiro real. Não há Pix, carteira, repasse ou cobrança.
Dados, usuários e senhas da demonstração local não são importados.

GUIA TÉCNICO
docs/SETUP_BACKEND_V1.md

PREPARAÇÃO
1. Conferir o projeto e os checkpoints do guia técnico.
2. Usar apenas URL e chave publishable em config.js. Nunca colocar service_role,
   senha de banco ou token administrativo no frontend/repositório público.
3. Login no Dashboard concluído. Site URL salvo: https://sommaapp.github.io/
   Allowlist: exatamente https://sommaapp.github.io/ (1 URL).
   Custom SMTP da Brevo e os modelos de confirmação e recuperação foram salvos
   e conferidos após recarregamento.
   Manter a confirmação de e-mail ativa.
4. Para servir a raiz localmente:
   python3 -m http.server 8080 --bind 127.0.0.1
   Abrir http://localhost:8080/

DEPENDÊNCIAS E VERIFICAÇÃO (NODE.JS 22 OU SUPERIOR)
npm ci --prefix tooling --ignore-scripts --no-audit --no-fund
npm --prefix tooling run vendor:check
npm --prefix tooling run test:logic

SDK Supabase: 2.118.0, cópia local em vendor/, com licença e proveniência.
vendor:sync reproduz a cópia a partir do pacote oficial.
Testes de navegador: Playwright 1.62.1; opção SOMMA_CHROMIUM_EXECUTABLE.
Detalhes de execução e limites no guia técnico.

ESTADO
Quatro migrações aplicadas. Security Advisor sem avisos após a correção.
Suíte SQL: 56/56 verificações sequenciais aprovadas, com rollback dos dados de teste.
Frontend: 18/18 lógica e 19/19 Chromium; zero exceções JS; layouts inspecionados.
SDK real na QA, com Auth/Data API interceptadas e service worker bloqueado.
Concorrência entre sessões, liberação do envio transacional na Brevo,
rastreamento/reescrita dos links, entrega de e-mail e Auth de ponta a ponta
ainda pendentes. PWA instalado e testes físicos de iPhone/Safari e Android/Chrome
também permanecem pendentes.
E-mail confirmado não equivale a identidade verificada.

Regras de limites, privacidade, prazo, idempotência e taxa ficam no servidor.

GITHUB
ChatGPT Codex Connector instalado na organização sommaapp, ID 172255507.
Seleção selected restrita ao repositório sommaapp/sommaapp.github.io.
Permissões visíveis: leitura de checks/status/metadados; leitura/escrita de
actions/code/issues/PR/workflows. Instalação confirmada pela UI e pelo MCP.
A branch remota somma/backend-v1-integration foi criada pelo MCP sobre a base
619ab2f4ea5ef337dbe06b16068dfe9dd117ae1a. Escrita efetivamente confirmada;
erro 403 inicial resolvido. Acompanhar o PR associado à branch de revisão.
Publicação na main ainda pendente; observar os critérios do guia técnico.
