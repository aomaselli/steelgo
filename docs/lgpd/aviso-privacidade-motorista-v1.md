# Aviso de Privacidade do Motorista — Rastreamento de Viagem (v1)

> **RASCUNHO PARA APROVAÇÃO DA FUNDADORA E REVISÃO JURÍDICA — NÃO PUBLICADO.**
> Este texto **não** está em nenhuma migration nem no banco. A migration 68 cria a tabela `privacy_notices` vazia; enquanto nenhum aviso estiver publicado, o sistema **não** abre sessão de rastreamento, **não** registra reconhecimento e **não** ingere localização (o aceite de viagem é recusado com `privacy_notice_unpublished`).
> Após aprovação, o texto final (exatamente como aprovado, sem marcadores) será publicado via `publish_privacy_notice(version = '1.0', body_md, effective_from, url, request_id)`, que calcula e grava o SHA-256 do corpo. Os campos entre colchetes **[…]** precisam ser definidos antes da publicação; a RPC rejeita textos com "placeholder", "rascunho" ou "TODO".

**Versão:** 1.0 · **Vigência:** [data de vigência, ex.: 2026-10-01] · **URL pública sugerida:** `https://steelgobr.com.br/privacidade/motorista/v1`
**Responsável pela plataforma:** SteelGo Tecnologia Ltda., CNPJ [CNPJ] [qualificação como controladora: revisão jurídica pendente — seção 5] · **Canal de privacidade e atendimento aos titulares:** [e-mail] (o e-mail `legal@steelgobr.com.br` já consta da Política de Privacidade geral)
[Encarregado(a) pelo tratamento de dados pessoais: indicação nominal PENDENTE — ver anexo técnico. A dispensa de encarregado para agente de pequeno porte NÃO é presumida, porque o rastreamento de localização pode exigir avaliação de alto risco.]

---

## 1. Para quem é este aviso e por que ele existe

Este aviso é dirigido a você, **motorista** cadastrado por uma transportadora na plataforma SteelGo, e explica, em linguagem direta, **quais dados de localização e de operação coletamos durante uma viagem, para quê, por quanto tempo e quem pode vê-los**. Ele complementa a Política de Privacidade geral da SteelGo e é exibido para reconhecimento **antes** de você aceitar a primeira viagem rastreada. Cada versão deste aviso tem um número, uma data de vigência e uma impressão digital (SHA-256) gravada no sistema; o seu reconhecimento registra a versão que você leu.

Base legal (Lei nº 13.709/2018 — LGPD): o rastreamento é **necessário para a execução do contrato de transporte** em que você atua (art. 7º, V), atende ao **legítimo interesse** da SteelGo, do embarcador e da transportadora na segurança da carga e na prova da entrega (art. 7º, IX), e serve ao **cumprimento de obrigações legais e regulatórias** do transporte rodoviário de cargas (art. 7º, II). Não usamos os dados de localização para finalidades incompatíveis com essas. **Este aviso não pede o seu consentimento**: o tratamento não se baseia em consentimento, e o seu reconhecimento (seção 8) comprova apenas que você recebeu e leu esta versão.

## 2. O que é coletado — e quando

**Somente durante uma viagem ativa.** A coleta começa quando você aceita a viagem e inicia o deslocamento para a coleta (estado "a caminho da coleta") e termina automaticamente quando a viagem é encerrada (entrega, retorno à origem, transbordo registrado, cancelamento ou disposição da carga). Fora desses momentos, o aplicativo **não** coleta nem envia localização, e o servidor **recusa** qualquer posição enviada fora de viagem ativa.

Durante a viagem ativa, coletamos:

- **Posição geográfica** (latitude, longitude), **precisão estimada**, **velocidade**, **direção** e **altitude** informadas pelo aparelho, com o **horário de captura** e o **horário de recebimento** pelo servidor;
- **Identificador técnico do aparelho** gerado pelo aplicativo (não é o IMEI nem o número de telefone), **plataforma** (Android/iOS), **versão do aplicativo** e o **provedor de localização** em uso, além do **nível de bateria** quando disponível;
- **Eventos operacionais** que você registra: chegada à coleta, carregamento (com foto e lacre, quando aplicável), saída, chegada à entrega, descarga, comprovante de entrega (nome e tipo/últimos 4 dígitos do documento do recebedor, assinatura e fotos), ocorrências (avaria, atraso, pane, documento) e o **alerta crítico** (ver seção 7);
- **Metadados de qualidade**: pontos rejeitados por baixa precisão, relógio incoerente ou velocidade impossível são marcados como anomalia e **não** são usados para avaliar você.

**Não coletamos** conteúdo do aparelho, contatos, mensagens, microfone, câmera fora das fotos que você mesmo tira para a viagem, nem localização em segundo plano fora de viagem.

## 3. Para que usamos

1. **Executar a viagem**: mostrar ao embarcador e à transportadora onde a carga está, estimar a chegada, coordenar coleta e entrega.
2. **Segurança da carga e sua**: identificar silêncio de comunicação, paradas longas fora de pátio, afastamento do destino e acionar o alerta crítico (seção 7).
3. **Prova da entrega e da operação**: o comprovante de entrega, as fotos e a linha do tempo da viagem são a evidência contratual entre embarcador e transportadora, inclusive em disputas.
4. **Obrigações legais e regulatórias** do transporte rodoviário de cargas e atendimento a autoridades quando exigido por lei.
5. **Melhoria e segurança da plataforma**: estatísticas agregadas (distância, duração, qualidade do sinal) sem identificar você individualmente.

**Não usamos** a localização para publicidade, para venda a terceiros, nem para pontuar ou ranquear motoristas.

## 4. Quem vê o quê

| Quem                                                                 | Durante a viagem ativa                                                                                                                                                     | Depois do encerramento                                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Transportadora** (dona do seu cadastro; proprietário e operadores) | Posição atual, trilha, ETA, eventos, ocorrências, seu nome e placa                                                                                                         | Resumo da viagem, eventos e comprovantes; trilha bruta até a purga (seção 6)             |
| **Embarcador da viagem**                                             | Posição atual, trilha da viagem, ETA, eventos, seu **nome e placa** (para receber a carga)                                                                                 | Resumo, eventos e comprovantes; **nome reduzido** (ex.: "João d.") e **placa mascarada** |
| **Leitores** (perfil de visualização do embarcador/transportadora)   | Somente acompanhamento, sem ações                                                                                                                                          | Idem                                                                                     |
| **SteelGo (equipe operacional/admin)**                               | Tudo o que for necessário para suporte, segurança e disputas; **cada solicitação de acesso à trilha e a arquivos fica registrada** (quem, quando, o quê)                   | Idem                                                                                     |
| **Terceiros**                                                        | Ninguém fora do contrato. Os provedores de infraestrutura da seção 5 tratam dados conforme os papéis ali descritos. Autoridades, apenas mediante obrigação legal ou ordem. |                                                                                          |

Você mesmo pode consultar e **exportar** os seus dados das suas viagens no aplicativo (seção 8).

## 5. Quem trata os dados (agentes de tratamento)

[REVISÃO JURÍDICA PENDENTE: a definição dos papéis abaixo — controlador, controlador conjunto ou operador — de SteelGo, transportadora, embarcador, Supabase, Vercel, Firebase e do futuro provedor de localização depende de análise contratual (arts. 5º, VI e VII, 39 e 42 da LGPD). O texto abaixo descreve o que cada um faz; a qualificação jurídica só será afirmada após essa análise.]

- **SteelGo** — opera a plataforma e define como o rastreamento funciona (coleta, retenção, acesso, exportação, purga).
- **Transportadora** — mantém o seu cadastro, designa você para a viagem e acompanha a operação; [papel a qualificar].
- **Embarcador** — contrata o transporte e acompanha a carga da viagem em que você atua; [papel a qualificar].
- **Supabase** — banco de dados, autenticação e armazenamento de arquivos (fotos, assinaturas, documentos), com controle de acesso por linha e registro das solicitações de acesso a arquivos; [papel a qualificar — provedor de infraestrutura].
- **Vercel** — hospedagem da aplicação web; [papel a qualificar — provedor de infraestrutura].
- **Google Firebase Cloud Messaging** — envio de notificações push ao seu aparelho, **somente quando o envio de push estiver ativado e homologado** para a sua plataforma. As notificações são minimizadas e não exibem localização precisa, documentos, valores financeiros nem outros dados sensíveis na tela bloqueada; os detalhes ficam disponíveis somente após autenticação no aplicativo; [papel a qualificar — provedor de infraestrutura].
- **Provedor de localização no aplicativo** — [PENDENTE: nenhum provedor de localização em segundo plano está homologado. Esta versão só será publicada citando o provedor real de produção; enquanto isso, o aplicativo mantém o rastreamento em segundo plano desligado e coleta posição apenas com o aplicativo aberto durante a viagem].

Os dados são armazenados na região [região do projeto Supabase, ex.: `sa-east-1` (São Paulo)]. Caso algum agente esteja fora do Brasil, a transferência internacional segue o art. 33 da LGPD.

## 6. Por quanto tempo guardamos

- **Trilha bruta de localização** (todos os pontos): **90 dias** após o encerramento da viagem. Depois disso ela é **apagada definitivamente**, ficando apenas um **resumo por hora** (trajeto simplificado, distância, tempo em movimento, paradas, qualidade do sinal) e os **fatos operacionais** da viagem, sem os pontos individuais.
- **Resumo e fatos operacionais, eventos e comprovantes de entrega**: **5 anos**, prazo compatível com a prescrição de obrigações contratuais e fiscais do transporte.
- **Preservação legal ("legal hold")**: se houver **disputa** entre embarcador e transportadora, **alerta crítico**, acidente ou furto/roubo, a trilha bruta **não é apagada** enquanto o caso estiver aberto, e por mais **30 dias** após o encerramento, para prova. A SteelGo pode aplicar uma preservação por exigência legal ou judicial; toda preservação e toda purga ficam registradas na linha do tempo da viagem.
- **Registro do seu reconhecimento** deste aviso (versão, hash, data): pelo tempo em que você estiver cadastrado, mais 5 anos. Esse registro histórico **não é apagado automaticamente com uma oposição ou pedido**, pois documenta qual versão foi apresentada e reconhecida; ele é mantido enquanto necessário para prestação de contas e pelo prazo de retenção informado, sem prejuízo do seu direito de formular pedido e receber resposta fundamentada conforme a LGPD.

## 7. Alerta crítico ("SOS") — o que ele é e o que ele NÃO é

O botão de alerta crítico do aplicativo envia **imediatamente** sua última posição e um aviso à transportadora e à equipe da SteelGo, abre uma ocorrência crítica, pausa a viagem para fins operacionais e **preserva a trilha**. A SteelGo trabalha com **metas de reconhecimento** (5 minutos) e escalonamento interno se ninguém reconhecer.

**Ele não substitui os serviços de emergência.** A SteelGo **não opera central 24 horas** e **não aciona automaticamente** polícia, bombeiros ou SAMU. Em emergência, ligue **190 (Polícia)**, **193 (Bombeiros)** ou **192 (SAMU)**. Enquanto o envio de notificações ao aparelho não estiver homologado para a sua plataforma, o aplicativo identifica o recurso como **"em homologação"** e informa isso na tela.

## 8. Seus direitos, o reconhecimento deste aviso e o que acontece se você não aceitar

**O que é o reconhecimento.** Ao marcar "Li e compreendi" e tocar em "Reconhecer", o aplicativo registra a versão, a impressão digital (SHA-256) e a data. Esse registro **comprova que você recebeu e leu esta versão**. Ele **não é consentimento**: o tratamento descrito aqui se baseia na execução do contrato de transporte, no legítimo interesse e em obrigações legais (seção 1), e não em uma autorização sua que pudesse ser retirada. Por isso o registro histórico **não é apagado automaticamente com uma oposição ou pedido**: ele documenta qual versão foi apresentada e reconhecida, e será mantido enquanto necessário para prestação de contas e pelo prazo de retenção informado (seção 6), sem prejuízo do seu direito de formular pedido e receber resposta fundamentada conforme a LGPD.

**Seus direitos (art. 18 da LGPD).** Pelo aplicativo ou pelo canal de privacidade indicado no início, você pode: **confirmar** que tratamos seus dados e **acessá-los**; **exportar** os seus dados das viagens em que atuou — o aplicativo gera um arquivo com **a sua trilha ainda retida, o resumo por hora, as suas sessões de rastreamento, os fatos operacionais que você registrou (eventos, checkpoints, desfecho dos comprovantes, classificação das ocorrências)** e a versão do aviso reconhecida, respeitando a purga já ocorrida; esse arquivo **não contém dados de outras pessoas** (nome, documento ou assinatura do recebedor, contatos de terceiros, fotos) nem textos livres escritos por terceiros; **corrigir** dados cadastrais incompletos ou desatualizados (via transportadora, que mantém seu cadastro); pedir a **eliminação** de dados tratados sem necessidade — observando que a trilha e os comprovantes de viagens já realizadas são **necessários para cumprimento de contrato e obrigação legal** e seguem os prazos da seção 6; obter **informação sobre compartilhamentos**; **apresentar oposição fundamentada** ao tratamento baseado em legítimo interesse, quando aplicável (art. 18, § 2º); e **questionar a necessidade e a proporcionalidade** do rastreamento, pelo mesmo canal, com resposta da SteelGo no prazo legal.

**O que acontece se você não aceitar.** Sem o reconhecimento do aviso vigente, você **não consegue aceitar viagens rastreadas**. Isso ocorre porque o rastreamento é **necessário à execução operacional do transporte na plataforma** — não porque exista um consentimento obrigatório. Você continua podendo usar o aplicativo para consultar seu cadastro e histórico. Se uma **nova versão** deste aviso for publicada, pediremos um novo reconhecimento antes do próximo aceite de viagem.

Você pode **encerrar a sessão de rastreamento** no aparelho a qualquer momento (por exemplo, ao trocar de aparelho ou sair do aplicativo); a transportadora e o embarcador verão a viagem como "sem atualização" e poderão entrar em contato. Desligar a localização **durante** uma viagem ativa não apaga o que já foi coletado e pode gerar ocorrência operacional, conforme o contrato com a sua transportadora.

## 9. Segurança

Todo tráfego é criptografado (TLS). O acesso a dados no banco é controlado por linha (RLS) e por papel; fotos, assinaturas e documentos ficam em armazenamento **privado**, sem link público: **cada solicitação de acesso e geração de URL temporária fica registrada** (quem, quando, qual arquivo); **a URL expira em 2 minutos e não é pública**. A trilha bruta só pode ser apagada pelo processo de retenção descrito na seção 6 ou por ação administrativa registrada, nunca pelo próprio usuário de forma silenciosa. Chaves e segredos ficam em cofre; o aplicativo não guarda credenciais de terceiros.

## 10. Alterações deste aviso

Cada versão tem número, data de vigência e impressão digital (SHA-256). A versão vigente e as anteriores ficam disponíveis na URL indicada no início. Mudanças relevantes exigem novo reconhecimento no aplicativo antes do próximo aceite de viagem; o histórico dos seus reconhecimentos fica registrado.

---

### Anexo técnico (não faz parte do texto exibido ao motorista — orienta a publicação)

- **Antes da publicação: concluir avaliação de legítimo interesse e Relatório de Impacto à Proteção de Dados Pessoais (RIPD), com análise do enquadramento de alto risco.** A indicação nominal do(a) encarregado(a) é decisão pendente dessa análise; não presumir dispensa por porte.
- **Revisão jurídica pendente dos papéis** (controlador / controlador conjunto / operador) de SteelGo, transportadora, embarcador, Supabase, Vercel, Firebase e do futuro provedor de localização — seção 5 não afirma qualificação.
- **Estados com coleta**: `en_route_to_pickup`, `at_pickup`, `loading`, `in_transit`, `at_delivery`, `unloading`, `returning`. Fora deles, `ingest_trip_locations` recusa com `tracking_inactive`.
- **Políticas vigentes (v1, `operational_policies`)**: retenção bruta 90 dias; resumo 5 anos; cauda de legal hold 30 dias; meta de reconhecimento do alerta crítico 5 min; precisão aceita até 100 m (rejeitada acima de 500 m); silêncio 20/30 min; lote máximo 200 pontos; idade máxima do ponto 72 h.
- **Acesso a mídia (seção 9)**: `request_trip_media_access` grava `trip_access_log` e devolve `expires_in_seconds = 120`; o cliente pede ao Storage uma URL assinada de no máximo 120 s (`min(expires_in_seconds, 120)`), e a policy SELECT do bucket `trip-media` só aceita a leitura se houver registro de acesso nos últimos 2 minutos. O que fica registrado é a **solicitação de acesso** (e, portanto, a geração da URL), não cada download da URL enquanto válida.
- **Exportação (seção 8)**: `export_my_trip_data()` devolve somente dados do próprio motorista e fatos operacionais (viagens, sessões, eventos/checkpoints/POD/ocorrências praticados por ele, resumo por hora, trilha bruta retida); exclui recebedor (nome, documento, assinatura), contatos e nomes de terceiros, caminhos de mídia, notas/descrições livres e ids de outras pessoas. Teste: `export_push_privacy_test_m3.sql`.
- **Push (seção 5)**: corpo do push vem do catálogo `push_minimized_body(kind)`; título e corpo passam pelo CHECK `push_outbox_text_minimized` (sem e-mail, CPF/CNPJ, telefone, `R$`, coordenada); `data` só com `kind/ref/link` (CHECK `push_outbox_data_allowlist`); o builder da Edge Function (`buildFcmMessage`) repete o filtro. Texto completo só na notificação in-app. Testes: `export_push_privacy_test_m3.sql` (banco) e `push_payload_test_m3.mjs` (builder).
- **Publicação**: `publish_privacy_notice('1.0', <corpo aprovado>, <vigência>, <url>, <request_id>)` como admin; a RPC grava `body_sha256`. Reconhecimento pelo motorista: `acknowledge_privacy_notice('1.0', <sha256>)`; o aceite de viagem exige a versão vigente reconhecida. O corpo publicado não deve conter os blocos marcados como rascunho/pendente nem este anexo.
- **Campos a definir antes da publicação**: CNPJ; canal de privacidade (e-mail); eventual encarregado(a) (decisão pendente); data de vigência; URL definitiva; região do projeto Supabase; provedor de localização homologado.
