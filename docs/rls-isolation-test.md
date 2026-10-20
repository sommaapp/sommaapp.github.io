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
