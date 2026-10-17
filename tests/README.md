# Verificação do frontend Somma

Os harnesses `frontend-logic.test.cjs` e `frontend-browser.test.cjs` funcionam tanto no diretório de preparação quanto no repositório estático final. Eles resolvem a raiz do projeto como a pasta acima de `tests/`: se existir `frontend/index.html`, usam essa subpasta; caso contrário, usam `index.html`, `app.js` e `backend.js` na própria raiz. A variável opcional `SOMMA_APP_DIR` permite indicar outro diretório explicitamente.

O teste de lógica usa apenas bibliotecas do Node. O teste de interface resolve Playwright a partir de `tooling/package.json`; instale as versões fixadas pelo lockfile. Com Node 22 ou superior, execute da raiz do projeto:

```sh
npm --prefix tooling ci
npm --prefix tooling run test:logic
npm --prefix tooling exec -- playwright install chromium
npm --prefix tooling run test:browser
```

Para um Chromium já instalado, informe `SOMMA_CHROMIUM_EXECUTABLE`. O runner aceita `SOMMA_TEST_OUTPUT_DIR` e, por padrão, salva JSON de resultados e capturas em `test-results/` na raiz do projeto. Esses resultados não pertencem à raiz pública do site.

## Resultado observado em 17/10/2026

- **18/18 verificações de lógica/API**: moeda em centavos, taxa, estado vazio, métricas, nomes públicos, limites, navegação e UUIDs, saída, campos permitidos e recuperação idempotente de resposta perdida.
- **19/19 verificações de interface**, com Playwright 1.62.1, Chromium 155.0.8059.84 e SDK Supabase 2.118.0 real: cadastro aguardando confirmação, erros e sucesso de login, back, modal/taxa, resposta perdida, clique repetido, pedido de 24h, segundo pedido bloqueado, histórico, edição de nome, notificações, offline, layout, logout com recarga, callback de recuperação e ausência de exceções JavaScript.
- O fixture de armazenamento antigo verificou a remoção de `user.password` e `users[*].password` em `somma_mvp_v37_state`, preservando nome, pedidos e uma chave local não relacionada. A rotina do app contém a lista restrita das oito versões antigas.
- Layout verificado em viewports Chromium de 360, 390 e 430 pixels; captura desktop de 1365 pixels. A inspeção visual corrigiu valores monetários truncados, uma opção de contribuição cortada e o início da página após login.

O harness UI intercepta toda requisição e utiliza fixtures locais. Não cria usuários reais, não envia e-mails nem altera o Supabase. O teste simula uma gravação seguida de perda de resposta e verifica que a consulta pela mesma chave recupera um único registro.

O service worker fica bloqueado durante esse harness, para garantir a interceptação das chamadas. Entrega real de e-mail, callback no domínio publicado, sessões de duas contas contra o banco, atualização de uma PWA instalada e aparelhos Android/iPhone reais continuam como verificações do ambiente de disponibilização. O relatório de testes SQL/RLS do backend é separado.
