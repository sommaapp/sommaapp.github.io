# Somma — frontend integrado ao Backend v1

Esta pasta contém a integração da interface v3.7 da Somma ao projeto Supabase existente. Mantém a identidade visual, as cinco abas, o pedido em três etapas e as telas de detalhes e notificações. A autenticação, os perfis, os pedidos, as contribuições simuladas e os avisos passam a usar registros do servidor.

**Esta versão continua na fase de testes. Não processa Pix, cobrança, transferência, saldo sacável ou qualquer pagamento real.** Os textos da interface e das confirmações deixam a simulação explícita.

## Arquivos e execução

- `index.html`: estrutura da interface, acesso, recuperação de senha e confirmação de contribuição.
- `styles.css`: estilo v3.7 preservado, com estados de conexão e ajustes de legibilidade em telas estreitas.
- `config.js`: URL do projeto, chave publicável, URL de retorno de e-mail e versões.
- `backend.js`: cliente Supabase e operações com as tabelas existentes.
- `app.js`: navegação, formulários, histórico, limites, notificações e atualização dos dados.
- `vendor/supabase-2.118.0.min.js`: distribuição UMD fixa do SDK; o navegador não baixa código de CDN em tempo de execução.
- `sw.js`, `manifest.json` e `icons/`: estrutura instalável e cache dos arquivos estáticos.

Não há etapa de build para servir a raiz do projeto. Para execução local, use um servidor HTTP, por exemplo, a partir da raiz do projeto:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra `http://localhost:8000`. Um login realizado por esse servidor usa o Supabase configurado em `config.js`; os testes automatizados descritos abaixo interceptam as requisições e usam dados artificiais locais.

Para disponibilização estática, o conteúdo completo da raiz do projeto precisa estar na raiz servida, preservando `vendor/`, `icons/`, os arquivos de configuração e o service worker. A publicação é uma etapa separada. Confira a URL de retorno antes de publicar em um domínio ou caminho diferente.

## Configuração pública e Auth

O destino configurado é `https://sxwsfgotsztetnawofyx.supabase.co`. A chave `sb_publishable_...` em `config.js` é destinada ao navegador. O frontend não contém chave administrativa, senha de banco, `service_role` ou chave secreta. As permissões efetivas vêm do JWT da pessoa autenticada, dos grants de coluna e das políticas RLS.

A URL de retorno configurada é `https://sommaapp.github.io/`. Em Supabase Auth, a configuração de Site URL e a lista de Redirect URLs precisam permitir esse endereço. Para testar links de e-mail em um servidor local, configure deliberadamente a URL local correspondente em Auth e em `config.js`; não use uma URL de produção diferente do destino pretendido.

O acesso oferece cadastro com `full_name`, login por e-mail e senha, reenvio de confirmação, solicitação de recuperação, formulário dedicado para nova senha e saída do aparelho. O cadastro informa quando é necessário confirmar o e-mail. A confirmação do e-mail não é apresentada como verificação de identidade, KYC ou promoção de nível.

O SDK usa sessão persistente, renovação automática e o fluxo de retorno `implicit` adequado a este frontend estático. Os tokens da sessão são geridos pelo SDK no armazenamento `somma_backend_v1_auth`. Senhas não são gravadas pelo código da Somma. O callback `onAuthStateChange` é síncrono e agenda as operações seguintes fora do lock de Auth; a recuperação de senha foi exercitada com o SDK real e respostas controladas.

**SMTP permanece uma dependência operacional para validar cadastro e recuperação com destinatários reais.** Configure e valide o remetente e o serviço de e-mail autorizados para o projeto. Não desative a confirmação de e-mail para contornar uma restrição de entrega. Os testes de interface não comprovam recebimento de e-mails nem a configuração de SMTP.

## Contrato com o banco existente

Esta integração espera as migrações do Backend v1, incluindo o endurecimento de integração aplicado em `20261017001333_backend_v1_integration_hardening.sql`. O esquema e a verificação do banco estão documentados fora da raiz do projeto, em `supabase/migrations/`, `tests/backend_v1_rollback.sql` e `docs/SETUP_BACKEND_V1.md`, relativos à raiz do projeto.

`backend.js` usa as tabelas protegidas por RLS e três RPCs públicas de leitura limitada, executadas como `SECURITY INVOKER` com `search_path` vazio. As RPCs não substituem o RLS nem concedem acesso a dados de outras contas:

| Recurso | Leitura/ação da interface | Campos enviados na mutação |
| --- | --- | --- |
| Auth | Cadastro, login, confirmação, recuperação, saída | Campos próprios do SDK de Auth |
| `profiles` | Perfil privado da conta; edição do nome | `full_name` |
| `public_profiles` | Nome abreviado e nível para cartões e histórico | Sem mutação |
| `user_levels` | Níveis e limites definidos no servidor | Sem mutação |
| `requests` | Pedidos visíveis à conta e publicação | `user_id`, `category`, `description`, `goal_cents`, `duration_hours` |
| `contributions` | Apoios enviados/recebidos e registro de simulação | `request_id`, `contributor_user_id`, `amount_cents`, `idempotency_key` |
| `notifications` | Avisos da própria conta, paginação e marcação como lidos | `read_at` |
| `somma_user_summary()` | Métricas agregadas da própria conta | Sem mutação |
| `somma_feed_summary()` | Contagem e destaques limitados de pedidos ativos de outras contas | Sem mutação |
| `somma_history_page(kind, before_at, before_id, limit, before_kind)` | Página do histórico com cursor por data, UUID e tipo de evento | Sem mutação |

UUIDs permanecem strings. Valores monetários são inteiros em centavos. A interface não envia saldo arrecadado, taxa, status de contribuição, contagem de pessoas, nível, limite, início ou expiração de pedido. Esses campos são calculados ou protegidos no banco. Feed e notificações usam paginação por cursor com 24 itens por página e uma linha-sentinela para determinar `hasMore` sem confundir página cheia com existência de uma próxima página. O histórico usa RPC com cursor composto por data, UUID e tipo de evento para não perder nem duplicar eventos quando tabelas diferentes compartilham data e UUID. As métricas e os destaques são calculados no servidor, evitando baixar todas as contribuições e pedidos para recomputar totais no navegador. Os perfis públicos são buscados somente para os IDs presentes no conjunto carregado.

### Regras exibidas

- Pedido mínimo de R$ 20,00, um pedido ativo por pessoa e intervalo de sete dias desde o último pedido, conforme o contrato existente.
- Prazo de 24 ou 48 horas. O cliente envia apenas a duração; timestamps de criação, início e expiração são determinados pelo servidor.
- Categorias: Alimentação, Combustível, Transporte, Medicamentos, Conta essencial, Trabalho, Emergência e Outro.
- Limites por pedido e por mês vêm do perfil, sem concessão local de nível ou limite. Um limite mensal `null`, inclusive no nível Especial, aparece como pendente de análise e impede a abertura de novo pedido pela interface.
- O período é **mês calendário UTC**, do primeiro ao último dia do mês. Não se trata de uma janela móvel de 30 dias. A interface informa essa convenção no perfil; o servidor faz a validação definitiva.
- Não é permitido ajudar o próprio pedido. Expiração, conta destinatária ativa, valor restante e limite do destinatário também são validados no servidor.
- A prévia da taxa reproduz o contrato em centavos: `20 + ceil(valor_em_centavos / 20)`, ou R$ 0,20 mais 5% arredondados para cima no centavo. Uma simulação de R$ 5,00 mostra taxa de R$ 0,45 e total de R$ 5,45. O registro da taxa é calculado no servidor.

A validação local melhora a experiência e as mensagens; não concede autorização para operações que o banco rejeita.

## Repetição segura de contribuição

Cada intenção de contribuir recebe um UUID aleatório. Enquanto houver dúvida sobre o resultado, o mesmo UUID, pedido e valor são preservados. O cliente usa `INSERT`, sem `upsert`.

Se a resposta falhar, o adaptador consulta a contribuição da própria conta pela chave de idempotência e confere pedido e valor. Um registro compatível já existente é tratado como sucesso. Erros definitivos de validação liberam a intenção somente depois de uma consulta concluída sem encontrar o registro. Falhas de rede ambíguas mantêm a intenção para a ação explícita “Conferir esta simulação”.

Há no máximo uma intenção pendente por aba, guardada em `sessionStorage` para sobreviver a uma recarga. Nada é reenviado automaticamente ao restabelecer a conexão. Se o armazenamento do navegador estiver indisponível, a intenção permanece em memória durante aquela sessão de página. A restrição única no banco continua sendo indispensável para impedir duplicações.

## Dados, histórico e privacidade

A versão não importa contas, pedidos ou nomes fictícios do protótipo local. A tela inicial vazia mostra ausência de pedidos. O nome completo fica no perfil privado; cartões e detalhes exibem `public_name`. A quantidade de pessoas ajudadas considera destinatários distintos, enquanto os apoios recebidos contam contribuições efetivas. Uma publicação aparece como publicação, sem ser confundida com recebimento de apoio. O histórico depende do acesso RLS aos pedidos dos quais a conta participou, inclusive quando finalizados.

As notificações são lidas do servidor e sua marcação persiste por conta. Atualizações de nome alteram somente `full_name`; o servidor recalcula o nome público. A saída elimina os dados privados do estado em memória, e uma recarga após a saída continua na tela de acesso.

### Remoção restrita de senhas antigas

Uma vez por inicialização, `removeLegacyPasswords()` examina somente os oito armazenamentos conhecidos do protótipo:

`somma_mvp_v37_state`, `somma_mvp_v36_state`, `somma_mvp_v35_state`, `somma_mvp_v34_state`, `apoio_mvp_v33_state`, `apoio_mvp_v32_state`, `apoio_mvp_v3_state` e `apoio_mvp_v2_state`.

Se houver JSON válido, remove exclusivamente `user.password` e `users[*].password`, preservando os demais campos. Não registra esses valores, não os envia ao servidor, não importa os dados antigos e não apaga todo o armazenamento local. JSON inválido ou armazenamento indisponível não bloqueiam o acesso. As chaves da sessão Supabase não são alteradas por essa rotina.

## Conexão, navegação e cache

A interface mostra carregamento inicial, erros, última atualização, ausência de conexão e intenção pendente. Uma falha de atualização mantém a leitura anterior com aviso. Após uma mutação confirmada, uma falha de atualização não transforma o sucesso já conhecido em uma mensagem de falha de gravação.

A navegação usa `history.pushState`/`popstate`, mantém UUIDs nos destinos e retorna à origem real ao fechar detalhes ou a contribuição. As atualizações automáticas evitam interromper os formulários de pedido, perfil e contribuição. Também há atualização manual.

O service worker guarda somente o conjunto de arquivos estáticos da interface. Auth, respostas do banco e mutações não entram em seu cache. Operações exigem conexão; não há fila de publicação ou de pagamentos offline. Ao lançar uma nova versão, atualize os identificadores de versão dos assets e do cache em conjunto.

## Verificação e limites do QA

Em 17/10/2026, a integração passou por **18 verificações locais de lógica/API e 19 verificações de interface em Chromium 155.0.8059.84**, com Playwright 1.62.1 e o SDK Supabase 2.118.0 real. Os testes são arquivos de desenvolvimento na pasta `tests/`:

- `tests/frontend-logic.test.cjs`: moeda em centavos, taxa, estado vazio, métricas, UUIDs, navegação, limites pendentes, proteção do nome privado, saída, campos permitidos e idempotência.
- `tests/frontend-browser.test.cjs`: cadastro aguardando confirmação, erros de login, login, navegação voltar, modal/taxa, resposta de contribuição perdida, repetição, pedido de 24 horas, bloqueio de segundo pedido, histórico, perfil, notificações, offline, logout com recarga, recuperação e limpeza de senhas antigas.

O harness de interface intercepta as requisições e responde com fixtures locais, inclusive uma resposta perdida após registrar a contribuição. **Não cria contas reais, não envia e-mails, não altera o Supabase e não substitui os testes RLS executados no banco.** Não ocorreram exceções JavaScript não tratadas. Os testes de layout verificaram larguras de 360, 390 e 430 pixels; também foi inspecionada uma captura de desktop de 1365 pixels. São viewports Chromium, sem afirmação de teste em aparelhos Android ou iPhones reais.

Com Node 22 ou superior e as dependências de `tooling/` instaladas, execute da raiz do projeto:

```sh
npm --prefix tooling ci
npm --prefix tooling run test:logic
npm --prefix tooling exec -- playwright install chromium
npm --prefix tooling run test:browser
```

Se houver um executável Chromium autorizado já instalado, informe seu caminho com a variável `SOMMA_CHROMIUM_EXECUTABLE`. O runner também aceita `SOMMA_TEST_OUTPUT_DIR`; por padrão, resultados e capturas vão para `test-results/`. Não inclua essa pasta na raiz pública do site.

Ainda devem ser exercitados no ambiente de disponibilização: entrega real de confirmação/recuperação, retorno ao domínio publicado, duas contas em sessões independentes contra o backend, atualização da versão instalada e os fluxos em Chrome Android e Safari iPhone reais. O service worker não foi habilitado no harness de UI, para garantir que todas as chamadas de teste fossem interceptadas.

## SDK fixo

SDK: `@supabase/supabase-js` **2.118.0**, arquivo UMD com 218.252 bytes e SHA-256:

```text
ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3
```

A reprodução da cópia do SDK e suas dependências fica em `tooling/`. Referências oficiais: [instalação do cliente JavaScript](https://supabase.com/docs/reference/javascript/installing), [cadastro](https://supabase.com/docs/reference/javascript/auth-signup), [eventos de autenticação](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) e [releases do SDK](https://github.com/supabase/supabase-js/releases/tag/v2.118.0).
