# Somma — envio de e-mails de autenticação

Preparação em 17/10/2026 UTC. Revisão: [PR nº 1](https://github.com/sommaapp/sommaapp.github.io/pull/1). **Este guia e os templates são preparação; SMTP personalizado e templates ainda não foram aplicados ao projeto.**

## Ponto de retomada

O usuário confirmou que ainda não possui domínio nem serviço de e-mail. O site permanece em `https://sommaapp.github.io/`, endereço já salvo como Site URL e único redirect autorizado no Supabase. A proposta é começar com **Brevo Free para um piloto limitado**. A escolha definitiva do provedor e qualquer compra de domínio dependem do usuário.

O serviço padrão do Supabase só envia aos endereços da equipe, com limite atual de 2 mensagens por hora. O projeto precisa de SMTP próprio para testar cadastros de outros destinatários autorizados. O Supabase aceita SMTP da Brevo e aplica seu próprio limite inicial de 30 mensagens por hora após configurar SMTP. Esse limite é separado da cota do provedor. [1]

## Opções verificadas

| Opção | Custo publicado | Requisito e uso proposto |
| --- | --- | --- |
| Brevo Free | US$ 0; até 300 e-mails por dia | Remetente pessoal verificado pode usar a substituição de endereço da Brevo; proposta para piloto, sujeita à liberação da conta |
| Domínio `.com.br` + Resend Free | Registro.br: R$ 40 por ano; Resend: US$ 0, até 3.000 e-mails/mês e 100/dia | Resend exige domínio verificado; alternativa com identidade própria para continuidade |

Preços e cotas consultados nas páginas oficiais em 17/10/2026 UTC. Não representam contratação. A disponibilidade de um nome de domínio não foi consultada. Brevo Free inclui envios transacionais e não exige cartão para começar; a liberação do envio pode depender de avaliação da conta. [2][3][4][8][9][10]

Sem domínio autenticado, a Brevo substitui o endereço do remetente de transacionais por um endereço em domínio compartilhado. Exemplo ilustrativo publicado pelo provedor: `mycompany@5000001.t-sender-sib.com`. Esse endereço é atribuído pela plataforma; não deve ser inventado nem preenchido manualmente como se pertencesse à Somma. A própria Brevo classifica essa solução como temporária e recomenda domínio próprio autenticado para uso contínuo. O nome de exibição proposto é **Somma**. [3]

O domínio do site e o domínio usado para enviar e-mail cumprem funções distintas. Adquirir futuramente um domínio remetente não exige mudar o endereço atual do site. A alternativa Resend pode enviar os e-mails de Auth por SMTP sem exigir uma assinatura separada de caixa postal; ela exige controle do DNS do domínio e uma chave de envio. [10]

## Configuração do piloto Brevo

1. O titular cria uma conta Free no [cadastro oficial da Brevo](https://onboarding.brevo.com/account/register/profile), confirma o próprio e-mail e conclui as informações solicitadas pelo provedor. Esta etapa não foi executada nesta preparação.
2. Em **Settings → Senders, Domains, IPs → Senders**, cadastrar o nome **Somma** e um endereço que o titular controla e deseja usar como remetente. Quando o domínio não está autenticado, a Brevo verifica esse endereço por código enviado à caixa postal. O código deve ser inserido no próprio site. [5]
3. Conferir se o envio transacional está ativo. Se houver suspensão ou solicitação de análise, seguir a ativação indicada pela Brevo; criar a conta não comprova que o SMTP foi liberado. [4]
4. Em **Settings → SMTP & API → SMTP**, obter o login SMTP efetivo e gerar uma chave exclusiva, por exemplo `Somma Supabase Auth`. Usar a variante padrão. A senha SMTP é a **chave SMTP**, distinta da chave de API e da senha da conta Brevo. A chave é exibida integralmente uma vez; guardar em gerenciador de senhas e inserir diretamente no campo seguro do Supabase. [6][7]
5. Em [Supabase → Authentication → Email → SMTP Settings](https://supabase.com/dashboard/project/sxwsfgotsztetnawofyx/auth/smtp), habilitar Custom SMTP somente quando todos os campos reais estiverem disponíveis:

| Campo | Valor a inserir |
| --- | --- |
| Sender name | `Somma` |
| Sender email | O endereço real verificado na Brevo, escolhido pelo titular |
| Host | `smtp-relay.brevo.com` |
| Port | `465` — TLS implícito |
| Username | O **SMTP login** exibido no painel Brevo; não presumir que é o e-mail de login da conta |
| Password | A chave SMTP exclusiva, inserida diretamente no painel |

A Brevo documenta o host e o login; a porta 465 usa SSL/TLS. Não gravar credenciais ou códigos no GitHub, chat, `config.js`, documentação ou capturas. Não exportar senhas de uma sessão para outra ferramenta. [6][7]

Antes de validar links, desativar o rastreamento de links conforme a recomendação do Supabase. A Brevo informa que acompanha aberturas e cliques por padrão. **Anonimizar métricas não comprova que a reescrita dos links foi desligada.** Não foi confirmada nesta preparação uma opção global de desligamento. Confirmar no painel ou suporte o controle disponível antes de considerar o envio de Auth pronto; depois verificar o link recebido de ponta a ponta. Registrar apenas resultado, sem copiar tokens ou URLs de autenticação para arquivos. [11][12]

## Templates preparados

O Supabase usa templates Go. Preservar `{{ .ConfirmationURL }}` integralmente: o servidor produz o endereço de verificação e inclui o retorno autorizado. Não substituir esse valor pela raiz do site nem montar tokens manualmente. Os dois arquivos evitam dados pessoais dinâmicos, imagens externas e scripts. [11]

| Evento no Supabase | Assunto proposto | HTML |
| --- | --- | --- |
| Confirm signup | `Confirme seu e-mail na Somma` | [confirm-signup.html](../supabase/templates/confirm-signup.html) |
| Reset password | `Redefina sua senha na Somma` | [reset-password.html](../supabase/templates/reset-password.html) |

Aplicar os assuntos e o conteúdo HTML no Dashboard **após ativar SMTP próprio**. Os arquivos no GitHub não configuram o projeto automaticamente. O bloqueio de edição de templates no serviço padrão do plano Free permanece relevante até essa ativação. [13]

## Aceite antes da publicação

- Confirmar remetente verificado, envio transacional ativo e configuração salva no Supabase.
- Manter confirmação de e-mail ativa; manter Site URL e allowlist atuais.
- Definir endereço(s) de teste e obter autorização de envio antes de disparar confirmação, recuperação ou reenvio. Não adicionar testadores à equipe administrativa do projeto para contornar o serviço padrão.
- Validar, em uma revisão acessível e autorizada do frontend integrado: cadastro → e-mail recebido → link confirmado → login; recuperação → link recebido → nova senha → login; depois logout. A revisão do PR ainda não está publicada no endereço de produção, portanto a raiz atual isoladamente não comprova esses fluxos.
- Conferir caixa de entrada/spam, remetente efetivo e retorno à aplicação, preservando tokens e dados de conta. Verificar reutilização/expiração dos links sem presumir um prazo não conferido no projeto.
- Conferir cotas e filas: a Brevo Free não acumula a cota diária; ao esgotá-la, mensagens transacionais podem ficar em fila. Um atraso pode tornar um link de Auth inválido antes da entrega. [2]
- Registrar o ambiente, a revisão e os resultados reais. A prévia local dos templates não testa entrega, renderização em clientes de e-mail ou autenticação hospedada. Dispositivos físicos, PWA e duas sessões simultâneas continuam no checklist principal.

## Referências oficiais

1. [Supabase — custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
2. [Brevo — limites do Free](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).
3. [Brevo — remetentes e substituição temporária](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders).
4. [Brevo — ativação e problemas de SMTP](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP).
5. [Brevo — criar e verificar remetente](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email).
6. [Brevo — configuração SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
7. [Brevo — chaves SMTP](https://help.brevo.com/hc/en-us/articles/7959631848850-Create-and-manage-your-SMTP-keys).
8. [Registro.br — registro de domínios](https://registro.br/).
9. [Resend — preços](https://resend.com/pricing).
10. [Resend — SMTP com Supabase](https://resend.com/docs/send-with-supabase-smtp).
11. [Supabase — email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
12. [Brevo — rastreamento e anonimização](https://help.brevo.com/hc/en-us/articles/11643306229906-Can-I-anonymize-the-tracking-of-opens-and-clicks-for-my-emails).
13. [Supabase — templates Free e SMTP próprio](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).
