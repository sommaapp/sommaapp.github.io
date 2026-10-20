# Contrato de integração da paginação

## Objetivo

Integrar a paginação do feed sem mudar os resultados financeiros, os limites de elegibilidade ou a completude do histórico. A função `requestPage()` na PR de paginação é apenas uma base de consulta: enquanto `snapshot()` continuar carregando todas as linhas, não há redução real do volume total.

## Estado atual observado

- `snapshot()` carrega pedidos, contribuições e notificações em coleções completas, usando lotes de 500.
- O resumo calcula o total recebido no mês, o valor disponível do limite, as contribuições feitas/recebidas e usuários ajudados a partir dessas coleções.
- Histórico e detalhes localizam pedidos em memória.
- A publicação de um pedido recupera o estado completo após falha para detectar se o registro foi criado.
- A atualização periódica pode disparar nova carga completa.

## Contratos que devem permanecer verdadeiros

1. **Feed:** cada página usa ordenação estável `created_at DESC, id DESC`; o cursor aponta para o último item efetivamente entregue, nunca para a linha extra de look-ahead.
2. **Visibilidade:** o cliente autenticado continua sujeito às políticas RLS. Nenhuma política pode ser relaxada para facilitar paginação.
3. **Elegibilidade:** o feed público inclui somente pedidos `active` que não expiraram ou não têm `expires_at`. A UI ainda deve revalidar estado/expiração no momento de abrir e contribuir; a paginação não autoriza ações.
4. **Resumo:** os totais mensais e limites não podem ser calculados apenas com a página atualmente visível.
5. **Histórico:** paginação de tela não pode fazer registros antigos desaparecerem do histórico; carregar mais deve ser explícito e determinístico.
6. **Contribuições:** preservar status `simulated_confirmed`, chave de idempotência e a distinção entre contribuições feitas e recebidas.
7. **Falhas:** erro ao carregar uma página adicional não deve apagar dados já exibidos; mostrar estado de repetição e impedir cursores duplicados.
8. **Atualização:** ao mudar filtros, usuário, sessão ou período, invalidar o cursor anterior. Evitar que uma resposta antiga sobrescreva uma sessão ou consulta mais recente.

## Contrato sugerido para a interface

- `loadRequestPage({ cursor, limit }) -> { items, hasMore, nextCursor }`
- `loadRequestDetail(id) -> request`, com autorização garantida no backend/RLS.
- `loadHistoryPage({ cursor, limit, kind }) -> { items, hasMore, nextCursor }`
- `loadSummary() -> { receivedMonthCents, availableCents, ownRequestCount, ... }`, calculado por consultas agregadas confiáveis ou por RPC validada. Nunca derivar limites financeiros do feed paginado.
- Notificações devem continuar limitadas ao usuário autenticado e podem ter paginação separada.

Os nomes acima são propostas de contrato, não APIs já implementadas.

## Estratégia de implementação

### Fase A — validar a consulta

- Exercitar a expressão de filtro contra uma instância PostgREST descartável e dados sintéticos.
- Cobrir timestamps iguais com IDs diferentes, cursores na primeira/última página, expiração nula, expiração futura/passada, e limite máximo.
- Confirmar que páginas consecutivas não duplicam nem omitem registros em um conjunto estático.
- Adicionar um teste de autorização/RLS com dois usuários sintéticos, se o ambiente descartável reproduzir as políticas reais.
- Não usar dados ou credenciais de produção nos testes.

### Fase B — resumo e histórico

- Projetar consultas agregadas/RPC para totais mensais e limites; revisar SQL, permissões e RLS antes de implementar.
- Definir a paginação do histórico separadamente do feed, com ordenação estável e filtros explícitos.
- Cobrir contribuições que apontam para pedidos não presentes na página atual.

### Fase C — interface

- Substituir o carregamento completo do feed por carregamento inicial e ação “carregar mais” ou paginação por cursor.
- Buscar detalhes sob demanda e cachear apenas dentro da sessão atual.
- Atualizar resumo, histórico, publicação e confirmação de contribuição para os novos contratos.
- Remover leituras completas somente depois que todas as telas e fluxos estiverem cobertos por testes de regressão.

### Fase D — desempenho e observabilidade

- Usar somente dados sintéticos com 1 mil, 10 mil e 100 mil pedidos/contribuições.
- Registrar quantidade de linhas e requisições por fluxo, latência p50/p95 e bytes transferidos; não registrar descrições, nomes, e-mails, tokens ou IDs pessoais.
- Verificar índices e planos de consulta antes de criar/remover índices.
- Comparar comportamento e resultados com a versão atual, não apenas velocidade.

## Critérios de aceite

- O feed percorre páginas sem duplicações ou lacunas em dados estáticos.
- RLS impede acesso cruzado entre usuários e nenhuma política de produção foi enfraquecida.
- Resumo mensal e limite permanecem idênticos aos valores calculados pela implementação atual em fixtures equivalentes.
- Histórico continua completo quando o usuário avança por todas as páginas.
- Testes de navegador, backend, integração PostgREST e regressão financeira passam no CI.
- Nenhuma migração, configuração, merge ou deploy de produção ocorre sem revisão e autorização explícita.

## Limitações e pendências

- A PR inicial de paginação testa o contrato com API mockada; isso não valida o parser PostgREST nem RLS real.
- Este documento é um plano de integração, não uma implementação.
- Hosting, índices e migrações devem ser avaliados em tarefas separadas.
