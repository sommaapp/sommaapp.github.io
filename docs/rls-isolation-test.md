# Teste de isolamento RLS com dois usuários sintéticos

## Objetivo
Executar uma regressão em PostgreSQL descartável para o isolamento entre dois usuários em perfis, pedidos, contribuições relacionadas e notificações.

## Cobertura
- Cada usuário lê somente o próprio perfil e vê seus pedidos, pedidos ativos/não expirados de contas ativas e pedidos nos quais contribuiu.
- Cada usuário lê contribuições próprias e contribuições vinculadas a pedidos de sua titularidade.
- Notificações são isoladas por usuário e o usuário consegue atualizar a própria notificação.
- O script usa apenas identificadores sintéticos e termina com ROLLBACK.

## Limitação
O teste recria em tabelas mínimas as formas das políticas observadas no catálogo do projeto. Não importa nem testa diretamente as políticas de produção, os JWTs emitidos pelo Supabase, os grants completos ou a função `private.can_read_request`. É uma regressão do padrão de autorização, não uma certificação da RLS de produção.

Antes de considerar a autorização validada, importar as migrações versionadas no ambiente descartável ou reproduzir fielmente o esquema necessário, e testar a função real com proprietário, colaborador, pedido ativo/não expirado e conta suspensa.

## Execução
O workflow usa PostgreSQL 16 descartável no GitHub Actions e remove os contêineres mesmo em caso de falha. Não usa credenciais, rede ou dados de produção; nenhuma migração ou configuração do Supabase é alterada.
