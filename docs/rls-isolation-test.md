# Teste de isolamento RLS com dois usuários sintéticos

## Objetivo
Executar uma regressão em PostgreSQL descartável para o isolamento entre dois usuários em perfis, pedidos, contribuições relacionadas e notificações.

## Cobertura
- Cada usuário lê somente o próprio perfil e vê seus pedidos, pedidos ativos/não expirados de contas ativas e pedidos nos quais contribuiu.
- Cada usuário lê contribuições próprias e contribuições vinculadas a pedidos de sua titularidade.
- Notificações são isoladas por usuário e o usuário consegue atualizar a própria notificação.
- O script usa apenas identificadores sintéticos e termina com ROLLBACK.

## Limitação
O teste usa tabelas mínimas sintéticas com nomes/colunas compatíveis e espelha o corpo SQL de `private.can_read_request` da migração versionada. Não carrega a migração integral nem executa o objeto instalado em produção; as políticas de outras tabelas e os grants completos também são recriados de forma reduzida. Não cobre JWTs emitidos pelo Supabase. É uma regressão contra deriva lógica do predicado, não uma certificação da RLS de produção.

Próximo passo: preparar um ambiente descartável que aplique as migrações versionadas completas e valide as políticas e grants efetivamente criados, com fixtures sintéticas para proprietário, colaborador, pedido ativo/não expirado, pedido expirado e conta suspensa.

## Execução
O workflow usa PostgreSQL 16 descartável no GitHub Actions e remove os contêineres mesmo em caso de falha. Não usa credenciais, rede ou dados de produção; nenhuma migração ou configuração do Supabase é alterada.

## Resultado registrado
A execução 6 do GitHub Actions passou após corrigir os delimitadores da função SQL no script: https://github.com/sommaapp/sommaapp.github.io/actions/runs/39482773989. O resultado valida somente este esquema mínimo sintético; as limitações acima permanecem.

## Validação das migrações versionadas
Foi adicionado um workflow separado que aplica todas as migrações em PostgreSQL descartável com uma camada mínima compatível com Supabase Auth e verifica a criação da função/política RLS e os privilégios básicos. A execução 1 passou: https://github.com/sommaapp/sommaapp.github.io/actions/runs/39484044721. Isso valida a aplicação das migrações nesse ambiente compatível, mas ainda não é um teste de isolamento com usuários sintéticos sobre as tabelas reais; essa etapa segue como próxima evolução.

## Isolamento contra o esquema migrado
A execução 4 do workflow de migrações passou incluindo um teste adicional de dois usuários contra as tabelas, políticas e triggers criados pelas migrações versionadas: https://github.com/sommaapp/sommaapp.github.io/actions/runs/39484323476. O cenário usa usuários sintéticos criados em `auth.users`, testa leitura de perfil, pedidos, contribuições e notificações, além de verificar que pedidos expirados e de conta suspensa não aparecem no feed. Os dados são revertidos com ROLLBACK e o PostgreSQL é descartável.

Limitação restante: o ambiente usa uma camada mínima compatível com `auth.uid()`, não a infraestrutura completa de Supabase Auth/JWT; também não representa tráfego ou configuração de produção.

### Testes negativos de autorização
A execução 9 do workflow de migrações passou após acrescentar verificações de que o papel `authenticated` não possui privilégios de UPDATE/DELETE em `public.requests` nem UPDATE em `public.notifications`: https://github.com/sommaapp/sommaapp.github.io/actions/runs/39485452832. A execução anterior havia falhado porque o próprio teste tentou executar UPDATE sem privilégio e o PostgreSQL corretamente retornou `permission denied`; o teste foi ajustado para validar os privilégios catalogados sem interromper a execução.


### Regras negativas de contribuição
A execução 15 do workflow de migrações validou identidade falsificada, autocontribuição, chave de idempotência duplicada, valor zero e valor acima da meta restante. Depois foram acrescentados dois casos adicionais para rejeitar contribuições destinadas a contas suspensas e pedidos expirados, mesmo quando o status persistido ainda aparece como `active`. A primeira execução falhou porque o teste tentou descobrir esses pedidos por uma consulta que a própria RLS corretamente ocultava; o fixture foi corrigido para usar os UUIDs sintéticos conhecidos. A validação corrigida passou em [execução de migrações](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39493186296) e o workflow de isolamento também passou em [execução sintética](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39493186419).

As validações de concorrência permanecem limitadas ao comportamento transacional dos triggers e locks no PostgreSQL descartável; ainda não há teste multi-sessão de carga/concor­rência nem validação com o Supabase Auth/JWT completo.


### Auditoria de concorrência — ponto pendente
A leitura da função `private.validate_contribution_insert()` identificou um risco que exige teste multi-sessão antes de encerrar a auditoria: as duas linhas de perfil (contribuidor e beneficiário) são bloqueadas com `FOR SHARE`. Esse modo permite que duas transações diferentes obtenham simultaneamente bloqueio compartilhado no mesmo perfil beneficiário. Como o limite mensal é calculado por `SUM(contributions)` antes do insert e os pedidos podem ser diferentes, é possível que ambas leiam o mesmo total anterior e aprovem valores que, somados, ultrapassem o limite mensal. O bloqueio `FOR UPDATE` no pedido protege o saldo/meta de um mesmo pedido, mas não serializa necessariamente contribuições em pedidos diferentes do mesmo beneficiário.

**Status: hipótese de corrida plausível, ainda não reproduzida.** Não alterei a migration de produção nem afirmei que a exploração foi confirmada. Próximo passo recomendado: criar teste concorrente com duas sessões e pedidos sintéticos distintos do mesmo beneficiário; se reproduzido, serializar a validação por beneficiário (respeitando ordem global de locks e risco de deadlock) e repetir o teste concorrente e toda a suíte de migrações. O teste atual de transação única não prova segurança sob concorrência.


### Auditoria de concorrência — refinamento e teste dedicado
A hipótese inicial de corrida entre pedidos diferentes foi refinada após revisar a restrição `requests_one_active_per_user`: um beneficiário não pode ter dois pedidos `active` simultaneamente. Além disso, `private.validate_contribution_insert()` bloqueia a linha do pedido com `FOR UPDATE` antes de calcular o total mensal. Portanto, contribuições concorrentes ao único pedido ativo ficam serializadas por esse bloqueio; a hipótese original de duas contribuições concorrentes em pedidos ativos distintos não se aplica ao esquema atual.

Foi adicionado `tests/postgres-contribution-concurrency.sh`, que usa duas sessões PostgreSQL reais, dois contribuidores sintéticos e o mesmo pedido ativo. Um trigger temporário de teste pausa as sessões depois da validação para forçar a sobreposição; o teste exige que apenas uma contribuição de 6.000 centavos seja aceita sob limite mensal de 10.000 centavos, e que a outra falhe especificamente com `recipient_period_limit_exceeded`. O trigger temporário e todos os dados são removidos ao final; o teste roda somente no PostgreSQL descartável do GitHub Actions.

A alteração temporária para `FOR UPDATE` nos perfis foi revertida: a serialização relevante é feita pelo bloqueio do pedido, e tornar exclusivos os bloqueios de perfil aumentaria a contenção sem evidência de necessidade. A conclusão final depende da execução bem-sucedida do novo teste e da suíte de migrações.


**Resultado do teste concorrente:** a suíte passou no GitHub Actions em [migrações + teste multi-sessão](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39494878625) e [isolamento RLS](https://github.com/sommaapp/sommaapp.github.io/actions/runs/39494878620). O cenário confirmou que, para o pedido ativo único, somente uma das duas contribuições de 6.000 centavos foi confirmada; a outra foi rejeitada pelo limite mensal. Isso valida o cenário testado em PostgreSQL 16 descartável, sem equivaler a teste de carga ou prova formal de todos os padrões de concorrência.
