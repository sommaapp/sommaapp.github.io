# SOMMA — estado da revisão técnica (21/10/2026)

## Estado do GitHub

- Pull request: [#8 — RLS user isolation](https://github.com/sommaapp/sommaapp.github.io/pull/8)
- Estado observado durante esta revisão: aberta, em draft, não mesclada.
- Branch: `test/rls-user-isolation`
- Commit observado: `f1b86f57219e271274746f38aa0147dd19518609`
- Site público de referência: https://sommaapp.github.io/

## CI confirmado

No commit `f1b86f57`, os três workflows terminaram com sucesso:

- [Frontend logic and browser tests](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39647667007)
- [Migrations on disposable PostgreSQL](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39647667338)
- [RLS user isolation integration](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39647666938)

Esses workflows usam fixtures sintéticas e PostgreSQL descartável. O teste de migrações não é uma aplicação das migrações em produção nem substitui a validação integral com Supabase Auth/JWT.

## Correção de métrica

A revisão identificou que a interface utilizava uma contagem global de pedidos concluídos para apresentar “metas concluídas com você”. A semântica era incorreta para uma métrica individual.

A RPC `somma_user_summary()` agora inclui `supported_requests`, contando pedidos distintos associados a contribuições do usuário autenticado com status `simulated_confirmed`. A interface mostra “pedidos apoiados” e o teste SQL verifica a métrica em relação aos dados sintéticos do usuário de teste.

## Limitações e segurança

- Contribuições continuam simuladas. Não há Pix, cobranças ou transferências reais.
- Os testes não comprovam carga de produção nem todos os comportamentos possíveis do Supabase Auth.
- Não foram feitas alterações no banco de produção durante esta revisão.
- Não fazer merge, deploy nem alterar configurações de produção sem autorização explícita.
- Não usar nem expor registros pessoais; manter testes com dados sintéticos.

## Próximas etapas

1. Manter a PR em revisão e conferir os workflows sempre que houver novos commits.
2. Continuar a revisão de RLS, autorização e escalabilidade, com evidência concreta antes de propor índices ou alterações.
3. Confirmar o comportamento operacional de Auth/e-mail e PWA no ambiente de disponibilização antes de considerar o lançamento.
4. Registrar as limitações de dispositivos reais que não tenham sido testados.


## Atualização da auditoria — 23/10/2026

### Estado confirmado do PR

- O PR #8 permanece aberto, em rascunho e não mesclado: https://github.com/sommaapp/sommaapp.github.io/pull/8
- HEAD verificado: `26a1e9426d6bffeb5aff47777ea33245bdd0ef86`.
- Os três workflows deste HEAD terminaram com sucesso:
  - [Frontend logic and browser tests](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39794137913)
  - [RLS user isolation integration](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39794137689)
  - [Migrations on disposable PostgreSQL](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39794137867)

### Verificações somente leitura no Supabase

- As oito tabelas de aplicação no schema `public` continuam com RLS habilitada.
- Não foi encontrada concessão de acesso direto às tabelas públicas para o papel `anon` na consulta de ACLs realizada.
- `authenticated` não possui privilégios gerais de escrita em nível de tabela nas tabelas de aplicação examinadas; as operações necessárias usam concessões mais estreitas por coluna e políticas RLS.
- As funções `SECURITY DEFINER` inspecionadas no schema `private` têm `search_path=""`. A única função desse grupo com execução concedida a `authenticated` é `private.can_read_request(uuid)`, usada pela política de leitura de pedidos. As demais funções de gatilho/validação não aparecem executáveis diretamente por `anon` ou `authenticated`.
- O schema `private` concede `USAGE` a `authenticated`; isso, isoladamente, não prova vulnerabilidade, pois a execução de cada função depende de ACL própria. A concessão é necessária para resolver a função auxiliar usada pela política RLS.
- Não foi feita alteração de esquema, política, privilégio ou dado no banco de produção durante essas verificações.

### Alertas e limites ainda abertos

- O Security Advisor continua sinalizando `auth_leaked_password_protection` (proteção contra senhas vazadas desabilitada). O alerta precisa ser resolvido na configuração de Supabase Auth e confirmado por nova leitura do Advisor; os testes SQL não corrigem esse ajuste.
- O conjunto de testes usa PostgreSQL descartável e uma camada de compatibilidade de Auth; não comprova todos os comportamentos do Supabase Auth real, JWT, e-mail ou API REST em produção.
- Os cinco índices marcados anteriormente como não utilizados não devem ser removidos sem evidência de carga e análise dos planos de consulta.
- Nenhuma alteração foi mesclada ou publicada. Manter o PR em draft até concluir validações e revisar os limites descritos.


### Revisão dos caminhos de escrita no cliente — 23/10/2026

Foi revisado `backend.js` na branch de auditoria:

- O cliente usa a chave publicável do Supabase, não uma chave administrativa/service-role.
- As escritas do cliente estão limitadas a criar pedidos, inserir contribuições, registrar denúncias, alterar o próprio nome e marcar notificações como lidas.
- Os métodos que recebem `userId` filtram pelo identificador informado, mas isso não é considerado uma fronteira de segurança: a autorização efetiva precisa continuar sendo imposta por RLS, grants por coluna e triggers no banco.
- A criação de contribuições reutiliza a mesma chave de idempotência após falha de resposta e procura a contribuição original antes de relatar erro; não cria automaticamente uma nova chave de tentativa.
- Não foi encontrado no arquivo inspecionado uso de `upsert`, escrita direta em status/contadores ou chave service-role.

Nenhuma falha nova e demonstrável foi identificada nessa leitura estática, portanto não foi alterada lógica de produção nem introduzida uma correção especulativa. Os caminhos ainda precisam ser exercitados no Supabase Auth/API real antes do lançamento.


### Atualização da auditoria — 23/10/2026 (HEAD 484d2a31)

- HEAD da branch `test/rls-user-isolation`: `484d2a31d4c8b1d9e3f7ebaf4cb9efe856ec6c09`.
- Os três workflows deste HEAD terminaram com sucesso:
  - [Frontend logic and browser tests](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39997740457)
  - [RLS user isolation integration](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39997740437)
  - [Migrations on disposable PostgreSQL](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39997740414)
- A cobertura de frontend agora verifica que os campos de senha de cadastro e recuperação exigem mínimo de 12 caracteres. Isso valida o comportamento do HTML/harness; não substitui validação do servidor Auth.
- O PR #8 segue aberto, em rascunho e não mesclado. Nenhum deploy ou alteração de produção foi executado.
- Nova consulta somente leitura ao Security Advisor confirmou `auth_leaked_password_protection` como WARN. A proteção contra senhas vazadas continua desabilitada; os cinco avisos `unused_index` são informativos e não justificam remoção sem análise de carga.
- O histórico de migrações em produção continua registrando apenas `20261016214851`, `20261016214904`, `20261016214956` e `20261017001333`. As quatro migrações posteriores permanecem fora de produção.
- Limitação pendente: os testes automatizados usam fixtures de navegador e PostgreSQL descartável com compatibilidade mínima de Auth. Ainda não comprovam todos os fluxos com JWT/Supabase Auth, entrega real de e-mail, nem comportamento sob carga.


### Atualização da auditoria — 24/10/2026 (HEAD de53b6df)

- HEAD da branch `test/rls-user-isolation`: `de53b6df64b32fd69e80dacad081c4247e0fca31`.
- Os três workflows deste HEAD terminaram com sucesso:
  - [Frontend logic and browser tests](https://github.com/sommaapp/sommaapp.github.io/actions/runs/40132941537)
  - [RLS user isolation integration](https://github.com/sommaapp/sommaapp.github.io/actions/runs/40132941544)
  - [Migrations on disposable PostgreSQL](https://github.com/sommaapp/sommaapp.github.io/actions/runs/40132941543)
- O teste de navegador cobre agora a ação “Já confirmei o e-mail — entrar”, redirecionamentos de cadastro/recuperação e a sequência entre formulários.
- Validação manual relatada pelo usuário: cadastro iniciado no site publicado, confirmação pelo telefone, recuperação de senha e login bem-sucedido no notebook. Isso demonstra um fluxo Auth real funcional, mas não comprova entrega consistente de todos os e-mails nem sincronização de dados entre dois dispositivos.
- Incidente observado: tentativas repetidas de cadastro geraram eventos `user_repeated_signup`; houve um evento de link de verificação inválido/expirado, e registros de confirmação bem-sucedida. Recomendação: evitar novas tentativas de cadastro com o mesmo endereço; preferir login/recuperação de senha.
- A interface publicada ainda exibe texto antigo de senha mínima de 8 caracteres, enquanto a versão na branch exige 12. A correção ainda não foi mesclada nem implantada.
- O PR #8 segue aberto, draft e não mesclado. Nenhuma migração, alteração de configuração ou deploy de produção foi executado durante esta atualização.
- Limitações restantes: confirmar sincronização real de dados entre notebook e celular; investigar a entrega de e-mails/SMTP e configuração de redirects; confirmar a política efetiva de senha no Auth; a proteção contra senhas vazadas permanece como alerta previamente identificado no Security Advisor.
