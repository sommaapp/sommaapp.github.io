# Somma — preparação e operação do Backend v1

Documento técnico de retomada. Atualizado em 19/10/2026 (UTC). Os campos `PENDENTE` são checkpoints de validação, não funcionalidades concluídas.

## 1. Escopo e estado de referência

O Backend v1 conecta a PWA existente ao Supabase para cadastro, login, perfil, pedidos, contribuições **simuladas**, histórico e notificações entre contas. Não há Pix, cobrança, carteira, repasse ou movimentação de dinheiro real nesta versão.

| Item | Referência desta implementação | Estado |
| --- | --- | --- |
| Site | `https://sommaapp.github.io/` | URL pública de referência; publicação desta revisão na `main` ainda pendente |
| Repositório | `sommaapp/sommaapp.github.io` | Branch remota de revisão: `somma/backend-v1-integration`, criada sobre `619ab2f4ea5ef337dbe06b16068dfe9dd117ae1a`; acompanhar o PR associado à branch |
| Supabase | Projeto `Somma`, ref `sxwsfgotsztetnawofyx` | Projeto existente e ativo, plano Free |
| Região | `sa-east-1` | São Paulo |
| URL da API | `https://sxwsfgotsztetnawofyx.supabase.co` | Endereço público; não é credencial |
| Banco | 8 tabelas de aplicação e 4 migrações aplicadas | Correção de integração aplicada com sucesso |
| Auth | E-mail e senha habilitados, cadastro habilitado, confirmação obrigatória, acesso anônimo desabilitado | Cadastro real, confirmação por e-mail, login, recuperação de senha e novo login validados no preview |
| URLs do Auth | Site URL `https://sommaapp.github.io/`; preview autorizado em `https://sommaapp-preview-heinrichjoak9-7101.vercel.app/**` | Produção preservada como Site URL; preview adicionado apenas à allowlist de Redirect URLs para os testes reais |
| SMTP | Custom SMTP da Brevo salvo e relido no Supabase: `Toggle SMTP = 1`, host `smtp-relay.brevo.com`, porta `465`, nome `Somma` | Entrega real validada para confirmação e recuperação no destinatário de teste autorizado; houve pequeno atraso observado. Controle de rastreamento/reescrita de links ainda não foi comprovado |
| SDK do navegador | `@supabase/supabase-js` `2.118.0` | Versão e integridade fixadas em `tooling/` |
| CLI de referência | `supabase` `2.121.0` | Usada na preparação; não é dependência do site |

Não recriar o projeto nem reaplicar todas as migrações sobre o banco existente. Antes de qualquer alteração de schema, consultar o histórico efetivo e comparar com os arquivos versionados.

### Histórico recuperado

| Arquivo de migração | Estado |
| --- | --- |
| `20261016214851_backend_v1_core_schema_rls.sql` | Migração existente recuperada do projeto |
| `20261016214904_backend_v1_advisor_hardening.sql` | Migração existente recuperada do projeto |
| `20261016214956_backend_v1_business_rules_alignment.sql` | Migração existente recuperada do projeto |
| `20261017001333_backend_v1_integration_hardening.sql` | Correção aplicada com sucesso; versão confirmada no ledger remoto |

A CLI gerou inicialmente o timestamp local `20261017000947`; o arquivo deve usar a versão remota final `20261017001333`, preservando o SQL aplicado. Conferir essa correspondência antes de concluir a revisão.

Após a quarta migração, o Security Advisor retornou `lints=[]`. O Performance Advisor retornou apenas 11 avisos `INFO` de [índices ainda não utilizados (`unused_index`)](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index); os índices foram mantidos, pois o banco ainda está vazio.

A suíte SQL sequencial executada no projeto hospedado passou **56 de 56 verificações**, em **17/10/2026 às 00:14:33 UTC**. O relatório está em [tests/backend_v1_results.json](../tests/backend_v1_results.json). Após `ROLLBACK`, a reconsulta confirmou zero registros em `auth.users`, `profiles`, `public_profiles`, `requests`, `contributions`, `notifications`, `reports` e `audit_log`. Em 19/10/2026, a conta real de teste foi usada simultaneamente em PC, iPhone e navegador anônimo; o Supabase registrou **3 sessões simultâneas**, e a alteração de nome do perfil apareceu nas três sessões.

### Checkpoint de fechamento pelo responsável

- [x] `MIGRACOES`: quatro versões aplicadas; correção final `20261017001333_backend_v1_integration_hardening` confirmada com sucesso.
- [x] `SECURITY_ADVISOR`: `lints=[]` após a correção. Performance: 11 avisos informativos `unused_index`, mantidos no banco vazio.
- [x] `AUTH_SETTINGS`: leitura pública conferida em 17/10/2026 UTC: `external.email=true`, `disable_signup=false`, `mailer_autoconfirm=false`, `anonymous_users=false`.
- [x] `DASHBOARD`: login concluído e configuração acessada pela UI autenticada.
- [x] `AUTH_URLS`: Site URL salvo como `https://sommaapp.github.io/`; allowlist salva com exatamente `https://sommaapp.github.io/` (1 URL).
- [x] `AUTH_SMTP_ESTADO`: leitura direta após navegação/recarregamento confirmou `Toggle SMTP = 1`, nome `Somma`, host `smtp-relay.brevo.com`, porta `465` e **Save changes** desabilitado. Essa conferência de persistência no painel não comprova entregabilidade.
- [x] `SMTP_PREPARACAO`: Brevo Free escolhida pelo usuário; conta acessada, remetente Somma verificado e validação de telefone concluída. Credencial SMTP exclusiva ativa, inserida no Supabase por fluxo seguro; dados de contato e credenciais não são registrados. Detalhes no [guia de configuração](SMTP_EMAIL_SETUP.md).
- [x] `AUTH_SMTP_ENTREGA_REAL`: confirmação de cadastro e recuperação de senha chegaram ao destinatário de teste autorizado e os links funcionaram no fluxo real. Foi observado pequeno atraso de entrega, sem falha funcional.
- [ ] `PENDENTE — SMTP_TRACKING`: confirmar explicitamente o estado do rastreamento/reescrita de links na Brevo; a entrega real foi validada, mas esse controle específico não foi comprovado.
- [x] `AUTH_TEMPLATES_READBACK`: confirmação e recuperação relidas após navegação completa/recarregamento; HTMLs e assuntos persistidos exatamente, com três ocorrências de `{{ .ConfirmationURL }}` em cada editor. **Save changes** desabilitado, sem alteração pendente; ambas as prévias visuais corretas.
- [x] `SQL_TESTS`: 56/56 verificações sequenciais no projeto hospedado em 17/10/2026 às 00:14:33 UTC; `ROLLBACK` seguido de contagem zero nas relações de usuários e uso verificadas. Relatório: `tests/backend_v1_results.json`.
- [x] `CONCORRENCIA_SESSOES`: três sessões simultâneas reais (PC, iPhone e navegador anônimo) registradas no Supabase; alteração de perfil sincronizada entre as três.
- [x] `FRONTEND`: implementação e QA controlada concluídas para a branch de revisão `somma/backend-v1-integration`: 18/18 testes de lógica, 19/19 testes Chromium, zero exceções JavaScript.
- [x] `GITHUB_ACESSO`: ChatGPT Codex Connector instalado na organização `sommaapp` (ID `172255507`), confirmado pela UI e pelo MCP; seleção `selected` apenas para `sommaapp/sommaapp.github.io`, com permissões de escrita visíveis.
- [x] `GITHUB_BRANCH`: branch remota `somma/backend-v1-integration` criada pelo MCP sobre `619ab2f4ea5ef337dbe06b16068dfe9dd117ae1a`; escrita efetivamente confirmada e erro 403 inicial resolvido.
- [ ] `PENDENTE — PUBLICACAO`: [PR nº 1](https://github.com/sommaapp/sommaapp.github.io/pull/1) em draft, sem merge; publicação da revisão na `main` ainda pendente.
- [x] `AUTH_E2E`: cadastro real, e-mail de confirmação, callback para o preview, login, recuperação de senha, definição de nova senha e novo login validados com conta de teste autorizada.
- [x] `IPHONE_PWA`: instalação na Tela de Início e abertura offline do shell validadas em iPhone real; o app exibiu estado sem conexão corretamente.
- [x] `DESKTOP_PWA`: instalação no Chrome/Windows, service worker ativo, cache `somma-app-backend-v1.1` e abertura offline do shell validados.
- [ ] `PENDENTE — ANDROID`: validar instalação e comportamento em Android/Chrome real.

### Acesso e revisão no GitHub

A instalação do **ChatGPT Codex Connector** na organização `sommaapp`, ID **`172255507`**, foi concluída e confirmada pela UI e pelo MCP. A seleção está em **`selected`**, somente para **`sommaapp/sommaapp.github.io`**. As permissões exibidas no GitHub são leitura de **checks, status e metadados**, e leitura/escrita de **actions, code, issues, pull requests e workflows**. O acesso necessário ao repositório foi confirmado. [8]

O MCP executou `CREATE_BRANCH` com sucesso para **`somma/backend-v1-integration`**, a partir do SHA **`619ab2f4ea5ef337dbe06b16068dfe9dd117ae1a`**. A operação confirma escrita efetiva no repositório; o erro HTTP 403 inicial foi resolvido após disponibilizar a instalação da organização. A criação de referência exige Contents de escrita. [9]

Usar `somma/backend-v1-integration` como **branch de revisão** e acompanhar o [PR nº 1](https://github.com/sommaapp/sommaapp.github.io/pull/1), **draft, sem merge**. A publicação na **`main` permanece pendente**, sujeita à revisão e aos critérios de validação descritos neste documento.

## 2. Estrutura dos dados e privacidade

| Relação | Uso previsto |
| --- | --- |
| `profiles` | Perfil privado do titular; nome completo e campos de nível/limites geridos pelo servidor |
| `public_profiles` | Projeção pública com nome abreviado e atributos públicos permitidos |
| `requests` | Pedidos, meta, arrecadação simulada, estado e expiração |
| `contributions` | Contribuições simuladas, valor, taxa calculada e chave de idempotência |
| `notifications` | Avisos do próprio usuário e leitura desses avisos |
| `user_levels` | Catálogo de níveis, limites e regras de progressão |
| `reports` | Denúncias e tratamento restrito conforme as políticas do banco |
| `audit_log` | Eventos internos de auditoria; acesso restrito |

A lista e os privilégios exatos devem ser conferidos com as migrações aplicadas. Nesta versão, os dados de comunidade são lidos por contas autenticadas: “público” significa visível às demais contas autorizadas, não acesso anônimo irrestrito. A aplicação não deve consultar `profiles` de outras pessoas para montar cartões públicos. Deve usar `public_profiles` e apresentar nome abreviado, por exemplo `Heinrich P.`. E-mail, nome completo, telefone, CPF, documentos e dados bancários não pertencem à projeção pública.

O frontend recebe apenas a URL do projeto e a chave **publishable**. RLS e os privilégios de tabela/coluna continuam sendo a barreira de autorização. Nunca colocar chave secreta, `service_role`, senha de banco ou token administrativo em `config.js`, HTML, repositório público ou logs do navegador. Chaves públicas não substituem RLS. [1]

O nome informado no cadastro é dado de perfil, não sinal de autorização. Nível, suspensão, limites e outras decisões de acesso não podem depender de `user_metadata` editável pelo usuário. A fonte de verdade é o banco com as políticas, privilégios e funções revisados. [1]

## 3. Regras que o servidor precisa preservar

- Um pedido ativo por usuário, limites por nível, intervalo entre pedidos e prazo de expiração devem ser verificados no banco, mesmo que o formulário também os mostre.
- Contrato da correção de integração aplicada: o cliente informa `duration_hours` com valor **24 ou 48**; `starts_at` e `expires_at` são definidos pelo relógio do servidor. A data enviada pelo navegador não deve ampliar a validade de um pedido. A suíte SQL sequencial foi aprovada; o comportamento de ponta a ponta em dispositivos reais permanece pendente.
- Autoajuda é recusada no servidor. A interface também desabilita a ação no próprio pedido.
- Uma contribuição não pode ultrapassar o que falta para a meta. Operações concorrentes devem respeitar a meta e os limites na mesma transação.
- Repetir a mesma intenção de contribuição deve preservar a mesma `idempotency_key`. Se a resposta se perder, consultar a intenção original antes de tentar outra operação.
- Criar um pedido sem contribuição deve produzir o estado **Pedido em arrecadação** e não incrementar a contagem de apoios recebidos.
- O período de limite adotado pelo backend existente é **mês calendário UTC**. Não converter essa regra em janela móvel de 30 dias ou mês no fuso do navegador. O corte mensal é à meia-noite UTC do primeiro dia; a interface deve explicar a mesma regra.
- A taxa é apenas simulada e paga pelo contribuinte; não reduz o valor destinado ao pedido. O cálculo autoritativo é em centavos: `platform_fee_cents = 20 + ceil(amount_cents * 0.05)`. Para evitar ponto flutuante no frontend, a estimativa equivalente para valores inteiros positivos é `20 + Math.ceil(amountCents / 20)`. A taxa definitiva é a retornada pelo banco.
- Exemplo: R$ 5,00 → taxa R$ 0,45 → total simulado R$ 5,45. Para R$ 1,01, a taxa é R$ 0,26 por arredondamento para cima.

| Nível | Limite por pedido | Limite por mês calendário UTC |
| --- | ---: | ---: |
| Inicial | R$ 50 | R$ 150 |
| Verificado | R$ 100 | R$ 300 |
| Comunidade | R$ 150 | R$ 450 |
| Confiável | R$ 200 | R$ 600 |
| Especial | Até R$ 300 | Definido por análise |

Contribuir não cria obrigação de restituição, reciprocidade ou direito automático de receber. A confirmação do e-mail permite autenticação; não equivale à verificação de identidade/KYC nem promove automaticamente o usuário para o nível Verificado.

## 4. Configuração do Auth

### 4.1 Configuração confirmada no Dashboard

O login no Dashboard foi concluído. Em [Auth → URL Configuration](https://supabase.com/dashboard/project/sxwsfgotsztetnawofyx/auth/url-configuration), os valores abaixo foram salvos e conferidos na UI autenticada:

```text
Site URL:      https://sommaapp.github.io/
Redirect URLs: https://sommaapp.github.io/
               https://sommaapp-preview-heinrichjoak9-7101.vercel.app/**
```

Usar a URL exata de produção como Site URL. O wildcard acima foi adicionado somente para o preview Vercel usado na validação real; remover esse retorno quando o preview for descontinuado. Se forem necessários outros retornos de desenvolvimento, incluir somente as URLs realmente utilizadas e registrá-las neste documento. O Site URL é o retorno padrão quando o cliente não informa outro; confirmação de e-mail e recuperação de senha dependem dessa configuração. [2]

Em [Auth → Providers](https://supabase.com/dashboard/project/sxwsfgotsztetnawofyx/auth/providers), manter o provedor Email, cadastro por e-mail/senha e confirmação de e-mail **ativa**. A leitura de `/auth/v1/settings` feita nesta retomada confirmou `external.email=true`, `disable_signup=false`, `mailer_autoconfirm=false` e acesso anônimo desabilitado. Isso confirma esses campos de configuração, não o fluxo completo de autenticação. [3]

O MCP disponível durante a preparação não expunha leitura/edição de configuração Auth. A Management API possui `GET/PATCH /v1/projects/{ref}/config/auth`, mediante autenticação administrativa própria. Não reutilizar ou extrair credenciais internas do conector. A consulta pública `/auth/v1/settings` informa apenas parte da configuração; nesta retomada, Site URL, allowlist e estado de Custom SMTP foram confirmados posteriormente pela UI autenticada do Dashboard. [4]

### 4.2 Fluxos no frontend estático

A integração usa o cliente JavaScript no navegador, sessão persistida, renovação automática e tratamento de sessão na URL. O fluxo escolhido nesta versão é `implicit`, documentado para aplicações sem servidor. Usar a raiz publicada como retorno evita depender de rotas de servidor ausentes no GitHub Pages. [3]

| Ação | Cliente Supabase | Comportamento necessário |
| --- | --- | --- |
| Cadastro | `auth.signUp` com `emailRedirectTo` para a raiz | Mostrar confirmação pendente quando não houver sessão; não entrar automaticamente por presumir sucesso |
| Login | `auth.signInWithPassword` | Carregar os dados autorizados somente após autenticação |
| Recuperação | `auth.resetPasswordForEmail` com `redirectTo` para a raiz | Mostrar resposta neutra sobre existência da conta |
| Retorno de recuperação | Evento `PASSWORD_RECOVERY` | Mostrar formulário de nova senha antes da navegação normal |
| Alterar senha recuperada | `auth.updateUser({ password })` | Exigir a sessão válida resultante do retorno |
| Logout | `auth.signOut` | Limpar estado de interface e impedir exibição de dados da conta anterior |

Registrar o listener de Auth durante a inicialização e evitar que a navegação sobrescreva o fragmento de confirmação/recuperação antes do SDK processá-lo. Tokens e senhas não devem ser inseridos em mensagens de erro, telemetria ou arquivos de diagnóstico. [3][5]

### 4.3 SMTP configurado e envio real validado

O usuário escolheu **Brevo Free para um piloto limitado**. A conta da Somma foi acessada, o remetente Somma foi verificado e a validação de telefone foi concluída. **Custom SMTP foi salvo no Supabase**, com host `smtp-relay.brevo.com`, porta `465` e nome de exibição `Somma`. A releitura direta após navegação/recarregamento confirmou `Toggle SMTP = 1`, os mesmos campos não sensíveis e **Save changes** desabilitado. A chave SMTP exclusiva aparece ativa na Brevo; o valor e os dados de contato não são registrados. O [guia SMTP e templates](SMTP_EMAIL_SETUP.md) mantém os detalhes operacionais.

Os templates em `supabase/templates/` foram salvos no Dashboard e relidos após navegação completa/recarregamento. A cópia integral de cada editor coincidiu exatamente com o HTML preparado, com três ocorrências de `{{ .ConfirmationURL }}` em cada um. Os assuntos persistiram exatamente: **Confirme seu e-mail na Somma** e **Redefina sua senha na Somma**. **Save changes** ficou desabilitado, sem alteração pendente. As prévias visuais de confirmação e recuperação foram conferidas e estão corretas.

**Envio operacional validado para o piloto:** foram recebidos e usados com sucesso os e-mails reais de confirmação de cadastro e recuperação de senha para o destinatário de teste autorizado. Os callbacks retornaram ao preview Vercel e o fluxo de Auth foi concluído de ponta a ponta. Houve pequeno atraso percebido na chegada do e-mail de recuperação, sem falha funcional. A UI da Brevo apresentou controle de anonimização, mas o estado específico de rastreamento/reescrita dos links ainda não foi comprovado.

A confirmação de e-mail permanece ativa. O site continua em `https://sommaapp.github.io/`; a versão integrada permanece no PR nº 1 em draft, sem merge. A compra de domínio não foi autorizada nem realizada.

Como referência do estado anterior, o SMTP padrão do Supabase só entrega para endereços da equipe, com limite documentado de **2 mensagens por hora** e entrega em melhor esforço. A configuração própria já foi salva e o fluxo real foi validado para o piloto com destinatário autorizado. Isso não equivale a teste de entregabilidade em escala ou em múltiplos provedores de e-mail. [4]

Desde **03/06/2026**, novos projetos Free que utilizam o SMTP padrão não podem alterar os templates de Auth. Os templates padrão de confirmação e recuperação permanecem disponíveis. Projetos Free com SMTP próprio podem personalizá-los. Não é necessário mudar o plano Supabase para essa finalidade, mas eventual provedor de e-mail tem suas próprias condições. Brevo Free foi escolhida para o piloto; não houve mudança de plano Supabase. [6]

Não desligar confirmação de e-mail apenas para contornar a restrição de envio. Não adicionar testadores à equipe administrativa do projeto para fazê-los caber no SMTP padrão.

## 5. Migração do protótipo local

Os dados da demonstração são exemplos locais e não devem ser importados como dados reais. Em especial:

- Não importar usuários, e-mails, senhas, sessões ou hashes do cadastro local.
- Não enviar pedidos, contribuições, saldos, níveis ou métricas da demonstração ao Supabase.
- Não reutilizar uma sessão local como prova de identidade. O usuário precisa autenticar-se no Supabase.
- Usar namespace próprio para a sessão real (`somma_backend_v1_auth`) e isolar o estado da conta atual.
- Informar na interface a transição para cadastro real sem prometer preservação de registros demonstrativos.

O service worker deve atualizar os arquivos da aplicação integrada. Em 19/10/2026, o worker foi endurecido no commit `cd195dd2c1266841b6f0775dbde471424eac661c`: o shell obrigatório é pré-cacheado separadamente dos recursos opcionais, navegações offline podem cair em `index.html` e o cache passou para `somma-app-backend-v1.1`. O preview foi republicado com manifest e ícones; a abertura offline foi validada em Chrome/Windows e iPhone.

## 6. SDK reproduzível e licenças

O site consome uma cópia local, sem CDN em tempo de execução:

```text
vendor/supabase-2.118.0.min.js
vendor/supabase-2.118.0.LICENSE.txt
vendor/supabase-2.118.0.NOTICES.txt
vendor/supabase-2.118.0.PROVENANCE.json
```

O JavaScript é uma cópia byte a byte de `dist/umd/supabase.js` do pacote npm oficial, já compactado pelo mantenedor. Não é recompilado localmente. O SHA-256 esperado é:

```text
ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3
```

O arquivo tem **218.252 bytes**. O pacote `@supabase/supabase-js@2.118.0` declara licença MIT e Node.js `>=22`. O lockfile registra a integridade dos pacotes e fixa as dependências transitivas. O arquivo `LICENSE` mantém o texto oficial do SDK; `NOTICES` preserva também as licenças de sua árvore de dependências, incluindo `tslib` sob 0BSD. [7]

Com Node.js 22 ou superior, a partir da raiz do repositório:

```bash
npm ci --prefix tooling --ignore-scripts --no-audit --no-fund
npm --prefix tooling run vendor:sync
npm --prefix tooling run vendor:check
```

`vendor:sync` copia somente o bundle, as licenças e a proveniência para `vendor/`. `vendor:check` compara todos esses arquivos sem alterá-los. Ambos usam os pacotes locais instalados, sem rede e sem executar scripts de dependências. O download ocorre apenas em `npm ci`, pelo registry registrado no lockfile.

Para conferir uma cópia em outro diretório:

```bash
npm --prefix tooling run vendor:check -- --target-dir /caminho/absoluto/vendor
```

Não versionar `tooling/node_modules/`. Ao atualizar o SDK, revisar a versão, lockfile, hash esperado, bundle, licenças, cache do service worker e testes de Auth juntos. Não usar `latest`, intervalo de versão ou CDN sem versão no HTML. A CLI `2.121.0` é uma ferramenta separada para manutenção do banco; consultar `--help` na versão fixada antes de registrar comandos de migração.

### 6.1 Testes de frontend reproduzíveis

O mesmo lockfile fixa **Playwright 1.62.1** para os testes; essa dependência de desenvolvimento não é copiada para `vendor/` nem incluída na licença do SDK. Os runners ficam em `tests/` na raiz e os scripts de `tooling/package.json` usam o caminho relativo correspondente.

```bash
npm --prefix tooling run test:logic
npm --prefix tooling run test:browser
```

A instalação de pacotes com `--ignore-scripts` não instala o navegador. Para usar o Chromium gerenciado pela versão fixada do Playwright:

```bash
node tooling/node_modules/playwright/cli.js install chromium
npm --prefix tooling run test:browser
```

Para usar um Chromium já instalado, o runner aceita a variável `SOMMA_CHROMIUM_EXECUTABLE` com seu caminho absoluto. Exemplo de execução local:

```bash
SOMMA_CHROMIUM_EXECUTABLE=/caminho/para/chromium npm --prefix tooling run test:browser
```

Não gravar caminhos do ambiente de desenvolvimento nos arquivos versionados. Os runners detectam a aplicação na raiz ou em `frontend/`; `SOMMA_APP_DIR` permite indicar outra localização. Instruções completas dos testes ficam em [tests/README.md](../tests/README.md).

Resultado final da QA controlada: **18/18 testes de lógica** e **19/19 testes de navegador**, com Chromium **155.0.8059.84** e zero exceções JavaScript. O SDK **2.118.0 real** foi carregado, mas as chamadas **Auth/Data API foram interceptadas localmente**. O service worker ficou **bloqueado no harness**. O responsável inspecionou layouts nas larguras 360, 390, 430 e 1365 pixels. O resultado de navegador está preservado em [docs/qa/somma_browser_results.json](qa/somma_browser_results.json).

Essas verificações aprovam a lógica e os fluxos de interface no ambiente controlado. Posteriormente, em 19/10/2026, Auth real, redirects do preview, múltiplas sessões, sincronização de perfil, instalação PWA e abertura offline foram validados em ambiente real no PC e iPhone. Android físico continua pendente.

## 7. Verificação e limites do que foi demonstrado

Os vídeos do pacote de continuidade verificavam o protótipo local no iPhone. Não constituem teste da integração Supabase. Testes com fixtures ou transações revertidas verificam regras do banco; não comprovam entrega de e-mail, callback em dispositivo real ou navegação entre contas no site publicado.

| Verificação | Critério de aceite | Estado nesta preparação |
| --- | --- | --- |
| Bundle e licenças | `vendor:check` sem diferença; SHA esperado | Verificado na área de preparação em 17/10/2026 UTC; repetir sobre os arquivos incorporados ao repositório |
| Schema | Quatro migrações aplicadas; SQL local corresponde ao ledger | Aplicação remota confirmada; conferir o nome final do quarto arquivo na revisão |
| Advisors | Sem avisos de segurança; performance avaliada no contexto | Security `lints=[]`; 11 `INFO unused_index`, mantidos por ausência de uso no banco vazio |
| Ausência de dados de produção | Nenhum usuário ou registro de uso criado indevidamente | `auth.users`, `profiles`, `requests` e `contributions` com contagem zero após a migração |
| RLS/privilégios | Isolamento e alterações protegidas cobertos pela suíte | Incluídos nas 56/56 verificações sequenciais aprovadas; escopo detalhado no relatório |
| Acesso sem sessão | Leitura de perfis e pedidos sem JWT de usuário recusada | GET de `profiles` e `requests` com chave pública retornaram 401 / permission denied em 17/10/2026 UTC; isso não substitui os testes entre contas |
| Regras de contribuição | Meta, autoajuda, taxa e repetição respeitadas nos cenários exercitados | Suíte SQL sequencial: 56/56 aprovadas, conforme relatório |
| Concorrência de sessão | Sessões simultâneas da mesma conta permanecem válidas e sincronizadas | 3 sessões reais simultâneas (PC, iPhone e anônimo) registradas; perfil sincronizado nas três. Concorrência transacional de duas contribuições ao mesmo pedido não foi exercitada em dispositivo real |
| Frontend em ambiente controlado | Lógica e fluxos de interface com SDK real e respostas de API interceptadas | 18/18 lógica e 19/19 Chromium 155.0.8059.84; zero exceções JS; relatório de QA |
| Layout | Larguras móveis e desktop sem problemas observados na inspeção | 360, 390, 430 e 1365 px inspecionados pelo responsável |
| URLs do Auth | Site URL e allowlist definidos no Dashboard | Site URL preservada em `https://sommaapp.github.io/`; preview Vercel adicionado à allowlist para callbacks de teste |
| SMTP efetivo | Identificar configuração salva e distinguir envio validado | Brevo Free salva como Custom SMTP; confirmação e recuperação recebidas e usadas com sucesso no piloto. Pequeno atraso observado. Estado de tracking/reescrita ainda pendente |
| Acesso GitHub | Instalação da organização com acesso ao repositório | ChatGPT Codex Connector em `sommaapp`, ID `172255507`; seleção somente `sommaapp/sommaapp.github.io`; permissões conferidas e escrita confirmada |
| Branch de revisão | Criar a referência remota na base correta | `somma/backend-v1-integration` criada pelo MCP sobre `619ab2f4ea5ef337dbe06b16068dfe9dd117ae1a` |
| Publicação | Revisão aprovada publicada na `main` | PR nº 1 em draft, sem merge; revisão `somma/backend-v1-integration` ainda não publicada na `main` |
| E-mail real | Confirmação e recuperação com envio e destinatário autorizados | Validado: cadastro confirmado, recuperação concluída e novo login realizado |
| Service worker/PWA | Cache com worker ativo e instalação funcionam no ambiente final | Validado no Chrome/Windows e iPhone; cache `somma-app-backend-v1.1`, shell offline e mensagem de conexão indisponível funcionando |
| iPhone e Android | Formulários, volta, teclado, PWA, cache, link de e-mail | iPhone real validado para instalação PWA e offline; Android/Chrome físico ainda pendente |

Para testar fluxos de e-mail sem entrega externa, o Supabase local disponibiliza Mailpit, que captura as mensagens localmente. Esse teste não substitui a conferência do SMTP hospedado. Não disparar cadastros, recuperação, reenvios ou convites para terceiros como teste automático. [3]

Antes de declarar a fase concluída para produção ampla, registrar os itens ainda pendentes com data, ambiente e revisão verificada. No estado atual: **Auth de ponta a ponta, múltiplas sessões e PWA em PC+iPhone estão validados; Android físico, tracking/reescrita do SMTP e publicação na `main` permanecem pendentes**.

## 8. Referências oficiais

1. [Supabase API keys](https://supabase.com/docs/guides/api/api-keys) e [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
2. [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
3. [Password-based Auth, fluxos e Mailpit](https://supabase.com/docs/guides/auth/passwords).
4. [SMTP e configuração pela Management API](https://supabase.com/docs/guides/auth/auth-smtp).
5. [JavaScript: resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).
6. [Changelog de 03/06/2026: templates de e-mail no Free](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).
7. [Metadados npm oficiais de @supabase/supabase-js 2.118.0](https://registry.npmjs.org/@supabase%2fsupabase-js/2.118.0) e [tarball oficial](https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.118.0.tgz).

8. [GitHub: revisar e modificar apps instalados](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps).
9. [GitHub REST: Git references e permissões para criar referência](https://docs.github.com/en/rest/git/refs).

As regras específicas da Somma vêm do pacote de continuidade e das decisões desta retomada; os links acima fundamentam o comportamento da infraestrutura. Configuração observada e documentação de referência devem continuar identificadas separadamente.
