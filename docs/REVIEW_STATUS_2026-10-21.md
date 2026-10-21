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
