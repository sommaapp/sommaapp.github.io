# SOMMA — plano de escalabilidade antes de divulgação nacional

## Status e escopo

Documento de planejamento. Esta branch não altera o comportamento do aplicativo, o banco de dados, políticas RLS, configurações do Supabase ou a hospedagem.

## Diagnóstico confirmado no código atual

- `backend.js`: `snapshot(userId)` carrega todas as páginas visíveis de `requests` e `contributions` por meio de `allRows()`, em lotes de 500 linhas.
- Após essas leituras, coleta IDs de usuários de todos os pedidos e contribuições e consulta `public_profiles` em blocos de 150.
- `app.js`: usa esses conjuntos completos para o feed, resumo pessoal, limites mensais e histórico. Limitar a consulta sem redesenhar esses cálculos pode produzir contagens, totais e limites incorretos.
- `app.js`: a atualização automática verifica a cada 15 segundos se os dados estão desatualizados; em geral, inicia recarga quando o último carregamento tem pelo menos 60 segundos. Retornar à aba pode antecipar a recarga.
- Portanto, o volume lido por sessão tende a crescer com a base. Ainda não há benchmark que quantifique o limite real de usuários.

## Proposta de arquitetura em etapas

### 1. Feed paginado de pedidos

- Definir contrato explícito de página (cursor baseado em `created_at` e `id`, ou outra ordenação estável).
- Buscar apenas pedidos necessários à página atual; carregar mais ao solicitar a próxima página.
- Carregar detalhes de um pedido sob demanda, mantendo a autorização RLS atual.
- Não assumir que paginação de interface é segurança: RLS continua obrigatória no banco.

### 2. Resumo pessoal e limites

- Calcular os valores de resumo a partir de consultas limitadas ao usuário autenticado e aos pedidos que ele possui/ajudou, ou por RPCs cuidadosamente revisadas.
- Para limites mensais, usar agregação no servidor com a mesma regra temporal UTC e os mesmos estados atualmente considerados.
- Não confiar em totais calculados exclusivamente no navegador para impor regras de negócio. Qualquer limite que proteja publicação/contribuição deve ser validado no banco.
- Tratar resposta perdida após escrita com idempotência, sem varrer toda a tabela para tentar descobrir se o pedido foi criado.

### 3. Histórico e notificações

- Paginar histórico por data/ID e buscar apenas as contribuições relevantes ao usuário.
- Limitar notificações à conta atual e paginar se necessário.
- Consultar perfis públicos apenas para os IDs exibidos na página, não para toda a base.

### 4. Atualização e cache

- Evitar recargas duplicadas e respeitar o estado de carregamento existente.
- Definir estratégia de atualização por tela, visibilidade e ações recentes; adicionar backoff em falhas.
- Não armazenar respostas autenticadas em cache compartilhado nem enfraquecer RLS.

### 5. Índices e banco

- Revisar consultas e filtros reais antes de criar/remover índices.
- Usar `EXPLAIN (ANALYZE, BUFFERS)` somente em ambiente de teste com dados sintéticos representativos.
- Avaliar índices para a ordenação/cursor do feed, consultas por dono, histórico de contribuições e notificações por usuário. A escolha final depende do esquema e dos planos de consulta.
- Nunca remover índices apenas porque o advisor os marcou como não utilizados em uma base pequena.

## Plano de validação

1. Criar fixtures sintéticas de tamanhos progressivos, por exemplo 1 mil, 10 mil e 100 mil pedidos/contribuições, sem dados pessoais reais.
2. Medir latência p50/p95, quantidade de linhas transferidas, número de chamadas, tamanho das respostas e erros.
3. Testar regressão de feed, detalhes, resumo, limites mensais, histórico, publicação com resposta perdida e contribuições idempotentes.
4. Verificar permissões com contas sintéticas diferentes para garantir que a paginação não exponha dados entre usuários.
5. Executar testes apenas em PostgreSQL/ambiente de staging descartável; não realizar teste de carga no projeto de produção.
6. Definir metas de aceitação antes do teste, incluindo latência p95 e volume máximo transferido por carregamento.

## Hospedagem e capacidade

- Confirmar a adequação da hospedagem pública atual para uma aplicação com login e funcionalidades de produto; avaliar a migração para uma plataforma apropriada antes de promoção nacional.
- Medir consumo e rever quotas/plano do Supabase com base em testes e métricas, não apenas em limites publicados.
- Definir alertas de uso, política de backup/recuperação e procedimento de rollback antes de tráfego significativo.

## Critérios para considerar a etapa concluída

- Nenhuma tela depende de baixar toda a base para funcionar.
- Feed e histórico têm paginação estável.
- Totais e limites continuam corretos, inclusive em mudanças de mês UTC.
- RLS e permissões não ficam mais permissivas.
- Testes automatizados passam; testes de carga sintéticos têm resultados registrados.
- Migrações/configurações de produção só são consideradas após revisão e autorização explícita.

## Não realizado

Nenhuma migração foi aplicada, nenhuma configuração foi alterada, nenhum dado real de usuário foi consultado e nenhum teste de carga foi executado contra produção.
