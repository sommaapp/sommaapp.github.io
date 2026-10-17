# Somma — envio de e-mails de autenticação

Atualização em 17/10/2026 UTC. Revisão: [PR nº 1](https://github.com/sommaapp/sommaapp.github.io/pull/1), **draft, sem merge**. **Custom SMTP da Brevo salvo no Supabase; liberação transacional, entregabilidade e Auth de ponta a ponta ainda pendentes.**

## Ponto de retomada

O usuário escolheu **Brevo Free para um piloto limitado**. A conta Brevo da Somma foi acessada, o remetente com nome **Somma** foi confirmado como verificado e a validação de telefone foi concluída. O site permanece em `https://sommaapp.github.io/`, endereço já salvo como Site URL e único redirect autorizado no Supabase. Não há domínio próprio adquirido; qualquer compra continua dependendo do usuário.

O serviço padrão anteriormente usado pelo projeto só envia aos endereços da equipe, com limite atual de 2 mensagens por hora. A configuração SMTP própria permite avançar para testes com outros destinatários autorizados, após confirmar a liberação do envio. O Supabase aceita SMTP da Brevo e aplica seu próprio limite inicial de 30 mensagens por hora após configurar SMTP. Esse limite é separado da cota do provedor. [1]

## Opções verificadas

| Opção | Custo publicado | Requisito e uso proposto |
| --- | --- | --- |
| Brevo Free | US$ 0; até 300 e-mails por dia | Escolhida para o piloto; remetente verificado, com envio ainda sujeito à liberação da conta |
| Domínio `.com.br` + Resend Free | Registro.br: R$ 40 por ano; Resend: US$ 0, até 3.000 e-mails/mês e 100/dia | Resend exige domínio verificado; alternativa com identidade própria para continuidade |

Preços e cotas consultados nas páginas oficiais em 17/10/2026 UTC. As opções pagas não foram contratadas. A disponibilidade de um nome de domínio não foi consultada. Brevo Free inclui envios transacionais e não exige cartão para começar; a liberação do envio pode depender de avaliação da conta. [2][3][4][8][9][10]

Sem domínio autenticado, a Brevo substitui o endereço do remetente de transacionais por um endereço em domínio compartilhado. Esse endereço é atribuído pela plataforma; não deve ser inventado nem preenchido manualmente como se pertencesse à Somma. A própria Brevo classifica essa solução como temporária e recomenda domínio próprio autenticado para uso contínuo. O nome de exibição configurado é **Somma**. [3]

O domínio do site e o domínio usado para enviar e-mail cumprem funções distintas. Adquirir futuramente um domínio remetente não exige mudar o endereço atual do site. A alternativa Resend pode enviar os e-mails de Auth por SMTP sem exigir uma assinatura separada de caixa postal; ela exige controle do DNS do domínio e uma chave de envio. [10]

## Configuração do piloto Brevo

1. **Concluído:** conta Brevo da Somma acessada e validação de telefone concluída. Nenhum dado de contato é registrado neste guia.
2. **Concluído:** remetente com nome **Somma** confirmado como verificado em **Settings → Senders, Domains, IPs → Senders**. O endereço e o código de verificação não são registrados aqui. [5]
3. **Pendente:** confirmar a liberação do envio transacional. A Brevo avançou ao passo 2, **Verificação**, mas mostra lista vazia/“Aguardando log” e o botão “Funciona!” desabilitado. Nenhum envio ou teste real foi realizado. Criar a conta e salvar a configuração não comprovam a liberação do SMTP. [4]
4. **Concluído:** chave SMTP exclusiva da variante padrão aparece ativa na Brevo; a lista final informa vencimento em **17/10/2027**. A senha SMTP é a **chave SMTP**, distinta da chave de API e da senha da conta Brevo. O valor foi inserido diretamente no campo seguro do Supabase e não é registrado neste guia. [6][7]
5. **Concluído:** Custom SMTP habilitado e salvo em [Supabase → Authentication → Email → SMTP Settings](https://supabase.com/dashboard/project/sxwsfgotsztetnawofyx/auth/smtp). A releitura após navegação/recarregamento confirmou **Toggle SMTP = 1**, nome **Somma**, host `smtp-relay.brevo.com`, porta `465` e **Save changes** desabilitado. Esse resultado confirma a configuração persistida no painel, sem comprovar entrega:

| Campo | Configuração |
| --- | --- |
| Sender name | `Somma` |
| Sender email | O endereço real verificado na Brevo, escolhido pelo titular |
| Host | `smtp-relay.brevo.com` |
| Port | `465` — TLS implícito |
| Username | O **SMTP login** exibido no painel Brevo; não presumir que é o e-mail de login da conta |
| Password | A chave SMTP exclusiva, inserida diretamente no painel |

A Brevo documenta o host e o login; a porta 465 usa SSL/TLS. Não gravar credenciais ou códigos no GitHub, chat, `config.js`, documentação ou capturas. Não exportar senhas de uma sessão para outra ferramenta. [6][7]

Antes de validar links, desativar o rastreamento de links conforme a recomendação do Supabase. A Brevo informa que acompanha aberturas e cliques por padrão. **Anonimizar métricas não comprova que a reescrita dos links foi desligada.** Na UI foi identificado apenas o controle de anonimização; uma opção global de desligamento não foi confirmada. Confirmar no painel ou suporte o controle disponível antes de considerar o envio de Auth pronto; depois verificar o link recebido de ponta a ponta. Registrar apenas resultado, sem copiar tokens ou URLs de autenticação para arquivos. [11][12]

## Templates salvos no Auth

O Supabase usa templates Go. Preservar `{{ .ConfirmationURL }}` integralmente: o servidor produz o endereço de verificação e inclui o retorno autorizado. Não substituir esse valor pela raiz do site nem montar tokens manualmente. Os dois arquivos evitam dados pessoais dinâmicos, imagens externas e scripts. [11]

| Evento no Supabase | Assunto salvo | HTML |
| --- | --- | --- |
| Confirm signup | `Confirme seu e-mail na Somma` | [confirm-signup.html](../supabase/templates/confirm-signup.html) |
| Reset password | `Redefina sua senha na Somma` | [reset-password.html](../supabase/templates/reset-password.html) |

Os dois templates e os assuntos acima foram salvos no Dashboard e relidos após navegação completa/recarregamento. A cópia integral de cada editor coincidiu exatamente com o HTML preparado, com três ocorrências de `{{ .ConfirmationURL }}` em cada um; os assuntos também persistiram exatamente. **Save changes** ficou desabilitado, sem alteração pendente. As prévias visuais de confirmação e recuperação foram conferidas e estão corretas. Os arquivos no GitHub não configuram o projeto automaticamente; a aplicação e a conferência ocorreram no Dashboard. Prévia e persistência no painel não comprovam entregabilidade. [13]

## Aceite antes da publicação

- Confirmar a liberação do envio transacional e a entrega real. Remetente verificado e configuração salva no Supabase já foram observados; não equivalem a envio operacional validado.
- Manter confirmação de e-mail ativa; manter Site URL e allowlist atuais.
- Definir endereço(s) de teste e obter autorização de envio antes de disparar confirmação, recuperação ou reenvio. Não adicionar testadores à equipe administrativa do projeto para contornar o serviço padrão.
- Validar, em uma revisão acessível e autorizada do frontend integrado: cadastro → e-mail recebido → link confirmado → login; recuperação → link recebido → nova senha → login; depois logout. O PR nº 1 permanece draft, sem merge nem publicação desta revisão no endereço de produção; a raiz atual isoladamente não comprova esses fluxos.
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
