# Rascunho — perguntas ao SERPRO e a uma GCC credenciada

**NÃO ENVIADO.** Rascunho para aprovação de Ariane. Nenhuma mensagem foi
transmitida, nenhum canal aberto, nenhum serviço contratado.

Os campos entre colchetes `[…]` são identificação que eu não tenho e não devo
inventar. Preencher antes de enviar.

## Por que são duas mensagens, e não uma

A versão anterior deste rascunho misturava as duas. **O SERPRO não é a GCC.**
A Gestora de Consentimento Credenciada é entidade credenciada pela SENATRAN,
contratada à parte, e o SERPRO não responde pelo contrato dela. Perguntar a um
sobre o outro produz resposta de cortesia, não compromisso.

- **Parte A** — ao SERPRO, sobre o Datavalid V5.
- **Parte B** — a uma GCC credenciada, sobre a autorização.
- Uma única pergunta de ligação (A1.4) vai ao SERPRO: **quais GCCs são
  compatíveis** com o ambiente contratado.

Base factual de ambas: levantamento de 09/10/2026 contra o ambiente oficial de
demonstração (OpenAPI `2609181441.4140937`) e a documentação pública —
[`datavalid-questoes-ao-serpro.md`](./datavalid-questoes-ao-serpro.md) e
[`datavalid-v5-matriz-capacidades.md`](./datavalid-v5-matriz-capacidades.md).

Documento irmão:
[`datavalid-gcc-requisitos-para-ligar.md`](./datavalid-gcc-requisitos-para-ligar.md)
— cada pergunta daqui está amarrada a um requisito de lá.

**O que não está aqui.** A confirmação do requisito de mTLS com certificado
ICP-Brasil e-CNPJ (C5) **não** entrou em nenhuma das duas mensagens. A Consulta
Online SENATRAN é integração distinta, com credenciamento e canal próprios;
pedir ao SERPRO ou à GCC que confirmem requisito de terceiro produz resposta de
cortesia. Enquanto a especificação não for lida, C5 segue como hipótese.

> **Premissa declarada nas duas mensagens.** Tratamos o ambiente de
> demonstração como mock: o que ele aceita, recusa ou devolve descreve o
> simulador, não o contrato de produção. Nenhuma pergunta abaixo foi respondida
> por observação.

---

# Parte A — ao SERPRO

**Assunto:** Datavalid V5 — dúvidas de especificação e de contrato antes da
contratação

Prezados,

Somos a [razão social], CNPJ [CNPJ]. Avaliamos a contratação do Datavalid V5
para validação de identidade de motoristas em plataforma de transporte de
carga. Antes de prosseguir, pedimos confirmação formal dos pontos abaixo.

## A1. Autorização por requisição

1. Como a autorização emitida por uma GCC credenciada acompanha a requisição de
   validação — em qual campo, em qual formato?
2. O serviço **valida** essa autorização junto à GCC emissora, ou apenas a
   registra e a repassa?
3. Uma mesma autorização pode cobrir mais de uma requisição de validação, ou é
   estritamente por operação?
4. **Quais GCCs credenciadas são compatíveis** com o ambiente contratado? Há
   lista publicada ou homologação prévia necessária?
5. Qual o comportamento esperado quando a autorização está expirada ou é
   recusada — qual status HTTP e qual corpo?

## A2. Campos de consentimento

`POST /v5/gcc/token` valida `parametros` contra uma lista fechada, devolvida
pelo próprio serviço no corpo do HTTP 400. Essa lista tem prefixos `cnh.` e
`endereco.`, **não tem prefixo `rfb.`**, e os três campos do bloco
`validacao.rfb` do endpoint de validação — `nome_social`, `situacao_cpf`,
`data_inscricao_cpf` — **não aparecem em forma alguma**.

Ao mesmo tempo, `POST /v5/pessoa-fisica/validacao` aceita esses três campos e
devolve comparação para eles.

1. Os campos do bloco RFB estão **fora do escopo** do consentimento por decisão
   — por já serem cobertos pelo template de tratamento RFB, registrado à parte
   — ou trata-se de lacuna do vocabulário?
2. Se estão cobertos pelo template, enviar `validacao.rfb.*` **sem** parâmetro
   correspondente no token é o comportamento **esperado** em produção?
3. Existe nome de parâmetro previsto para esses campos que não conste da lista
   devolvida pelo HTTP 400?
4. O vocabulário de parâmetros é versionado? Como somos notificados quando
   muda?

> Enquanto não houver resposta, **não enviamos os três campos**. A omissão é
> registrada e a comparação volta não avaliada. Enviar campo que o token não
> autoriza seria tratar dado sem base declarada; presumir que o template cobre
> seria decidir por conta própria uma questão de base legal.

## A3. Situação e impedimento da CNH

O endpoint responde por **comparação**: confirma se o valor que enviamos
confere, não informa a situação vigente. Para decidir se um motorista pode
dirigir hoje, precisamos da situação atual.

1. Sondar `situacao` e `data_validade` por comparação sucessiva é **uso
   previsto e aceitável** do serviço?
2. Existe caminho próprio — endpoint, módulo ou produto — que devolva a
   **situação atual** da habilitação, em vez de confirmá-la por tentativa?
3. **`possui_impedimento`**: a massa oficial de exemplos traz
   `cnh_possui_impedimento` como **código numérico**; a página "Campos
   Disponíveis" lista o campo com tabela de domínio `"-"` — isto é, sem tabela
   —; e a requisição espera **booleano**. Qual é a tradução oficial? `"1"`
   significa "possui impedimento", ou é código de outra coisa?
4. O campo `cnh.observacoes` carrega restrições que afetam a aptidão para
   dirigir, ou é texto sem domínio definido?

> Enquanto não houver resposta para A3.3, **não enviamos o campo**. É o campo
> que, lido ao contrário, reprova motorista habilitado ou aprova motorista
> impedido, e a convenção de que `1` é verdadeiro não está publicada.

## A4. Captura e prova de vida

1. Quais são os **requisitos técnicos da imagem** aceita em
   `biometria_facial` — resolução mínima, formato, compressão, enquadramento,
   tamanho máximo?
2. A **prova de vida** (`vivacidade`) é avaliada a partir da mesma imagem
   estática, ou exige captura com desafio, vídeo ou múltiplos quadros?
3. Há **SDK ou biblioteca de captura homologada** pelo SERPRO, ou a captura é
   responsabilidade inteira do contratante?
4. `vivacidade` e `similaridade` são verdictos **independentes** — confirmam
   que aprovar por um sem o outro é uso incorreto?
5. Quais valores de **similaridade** e de **probabilidade** são recomendados
   para aceitar uma correspondência facial? (A decisão do limiar é nossa; a
   recomendação é informação de vocês.)
6. O mesmo para `biometria_digital`, caso venhamos a usá-la.

## A5. Tratamento de respostas desconhecidas

Nossa implementação **recusa** código que não esteja na tabela de domínio
publicada, em vez de convertê-lo por suposição. Queremos confirmar que essa é a
postura correta.

1. O serviço pode devolver, em produção, valor de domínio **não publicado** na
   documentação vigente?
2. Em caso afirmativo, qual o procedimento recomendado para o contratante —
   recusar, tratar como inconclusivo, ou outro?
3. Há **changelog versionado** das tabelas de domínio e do OpenAPI? Qual o
   prazo de aviso prévio para mudança de contrato?
4. Qual é o canal de suporte técnico para divergência entre documentação e
   comportamento do serviço, e qual o SLA de resposta?

## A6. Cobrança

1. Cada requisição de validação é faturada individualmente?
2. Uma sondagem como a de A3.1 contaria como **uma requisição por valor
   testado**?
3. Requisição que resulta em **não correspondência** é cobrada?
4. Requisição recusada por erro de contrato (HTTP 4xx) é cobrada?
5. Há franquia, mínimo mensal, ou faixas por volume?
6. O ambiente de homologação é cobrado?

A resposta decide se a sondagem de A3.1 é economicamente viável ou se
precisamos de outra fonte.

## A7. Contratação, ambientes e template RFB

1. O contrato do Datavalid V5 inclui **biometria facial**, ou é módulo à parte?
2. O **credenciamento junto à SENATRAN** é exigido para qual módulo —
   identidade, CNH, ou ambos? Precede a contratação ou corre em paralelo?
3. Há **ambiente de homologação com credenciais próprias**, distinto do
   ambiente público de demonstração? Qual o procedimento para obtê-lo?
4. **Endereço do registro do template de tratamento RFB.** Encontramos três
   variantes entre fontes oficiais:

   | Fonte | Endereço |
   |---|---|
   | Webinar técnico V5 | `POST /v5/pessoa-fisica/privacidade/rfb/template-de-tratamento/` |
   | Artigo "Registro do Template" | `POST /pessoa-fisica/privacidade/rfb/template-de-tratamento/` |
   | OpenAPI de demonstração | `POST /v5/pessoa-fisica/privacidade/rfb/template-tratamento` |

   São duas diferenças independentes: `template-de-tratamento` ×
   `template-tratamento`, e presença ou ausência do prefixo `/v5`. O mesmo
   artigo se contradiz entre o POST e os dois GET. **Qual vale no ambiente
   contratado?**
5. O corpo do template usa `agente_de_tratamento` (prosa) ou
   `agente_tratamento` (OpenAPI)? E `como_exercer_direitos` é **texto livre**
   (prosa) ou **lista de enum** `PRESENCIALMENTE | REQUISICAO_ELETRONICA |
   OUTRO` (OpenAPI)?
6. O `id_template` devolvido é por finalidade, por contratante, ou por ambos?
   Expira?

## A8. Observações sobre o ambiente de demonstração

Não são perguntas de contrato. Se forem conhecidas, agradecemos a confirmação;
se forem defeito do ambiente, gostaríamos de reportá-las.

1. As **cinco CNHs da massa fictícia estão vencidas** (validades de 2022 a
   2025). Uma esteira que reprove por vencimento antes de qualquer outra
   verificação não consegue exercitar o caminho aprovado sem substituir a data
   por entrada sintética.
2. A **biometria facial** da massa devolve `vivacidade: "REAL"` com
   `similaridade: 0.001` e `probabilidade: "Baixíssima probabilidade"`. É
   esperado que apenas a prova de vida passe?
3. O bearer público de demonstração é compartilhado e limitado por taxa — uma
   homologação com poucas chamadas seguidas recebe 429 com facilidade. Há
   limite publicado?

Ficamos à disposição para detalhar qualquer ponto.

Atenciosamente,
[nome] · [cargo] · [razão social] — CNPJ [CNPJ] · [telefone] · [e-mail]

---

# Parte B — a uma GCC credenciada

**Destinatário:** entidade credenciada pela SENATRAN nos termos da Portaria
nº 139/2025. **Não é o SERPRO.**

**Assunto:** Contratação de gestão de consentimento para validação de
identidade de motoristas

Prezados,

Somos a [razão social], CNPJ [CNPJ]. Avaliamos a contratação de gestão de
consentimento para uso com o Datavalid V5 do SERPRO.

## B1. Credenciamento e contratação

1. Confirmam o credenciamento junto à SENATRAN e o número ou ato de
   credenciamento?
2. Quais serviços do Datavalid V5 a autorização de vocês cobre?
3. Há pré-requisito de credenciamento **nosso** junto à SENATRAN antes da
   contratação?
4. Há ambiente de homologação com credenciais próprias?
5. Qual o prazo típico entre contratação e primeira emissão em produção?

## B2. Emissão da autorização

1. Qual o **escopo** de uma autorização — um titular, uma finalidade, um
   conjunto de campos, uma operação?
2. Qual a **validade** do token emitido?
3. A autorização é **reutilizável** dentro da validade, ou é estritamente por
   operação?
4. Qual o comportamento em caso de **reenvio** da mesma solicitação de emissão:
   idempotência por chave, ou nova emissão?
5. Qual o **tempo de resposta** esperado e qual o SLA de disponibilidade?

> Esta pergunta tem consequência direta no nosso código. Hoje a emissão é feita
> **uma única vez** por operação, sem repetição automática após um envio
> possivelmente concluído — porque repetir uma emissão que talvez tenha sido
> registrada do outro lado é pior do que falhar de forma declarada.

## B3. Vocabulário de parâmetros

1. O vocabulário de `parametros` aceito por vocês é o mesmo publicado pelo
   SERPRO, ou tem lista própria?
2. **Os campos do bloco RFB** — `nome_social`, `situacao_cpf`,
   `data_inscricao_cpf` — são autorizáveis por vocês? Sob qual nome?
3. O vocabulário é versionado? Como somos notificados de mudança?

## B4. Retirada de consentimento

1. Qual o canal pelo qual o titular retira o consentimento junto a vocês?
2. **A retirada invalida autorizações já emitidas e ainda dentro da validade?**
3. Somos notificados da retirada, ou precisamos consultar?
4. Qual o prazo entre a retirada pelo titular e a sua propagação?

> Isto importa porque, do nosso lado, uma credencial já emitida continua válida
> até expirar. Precisamos saber se do lado de vocês é igual, para não prometer
> ao titular uma revogação que não existe.

## B5. Auditoria e registro

1. Qual trilha de eventos de consentimento vocês mantêm, e por quanto tempo?
2. Temos acesso de consulta a essa trilha? Por qual interface?
3. Em caso de questionamento judicial ou de autoridade, quem fornece a
   evidência do consentimento — vocês, nós, ou ambos?
4. Qual o formato da evidência?

## B6. Tratamento de erro e resposta desconhecida

1. Qual a tabela de códigos de erro da emissão, e ela é versionada?
2. O serviço pode devolver valor não publicado? Qual o procedimento
   recomendado?
3. Qual o `Content-Type` da resposta de emissão? (O simulador público do SERPRO
   responde `text/plain` com o token puro e devolve **406** para
   `Accept: application/json`; queremos saber se o contrato de vocês segue a
   mesma convenção.)

## B7. Cobrança

1. A cobrança é por autorização emitida, por titular, ou por assinatura?
2. Emissão recusada é cobrada?
3. Há franquia, mínimo mensal ou faixas por volume?
4. O ambiente de homologação é cobrado?

Ficamos à disposição.

Atenciosamente,
[nome] · [cargo] · [razão social] — CNPJ [CNPJ] · [telefone] · [e-mail]

---

## Nota de controle — não enviar

- **Nenhum dado pessoal real** no envio: nada de CPF de motorista, imagem,
  token ou credencial. As perguntas são sobre contrato e especificação.
- **Perguntas que mudam o comportamento do adaptador:** A2.1–A2.3, A3.1–A3.3,
  A4.1–A4.2, A5.1–A5.2, B2.1–B2.3, B4.2. As demais mudam cronograma ou custo.
- **Perguntas que mudam o custo:** A6 inteira, B7 inteira, e A3.1 por
  consequência.
- Enquanto as respostas não chegarem, o adaptador opera pela leitura mais
  restritiva: campo sem base declarada não é enviado, código fora da tabela é
  recusado em vez de convertido, e comparação não avaliada **impede** aprovação
  composta.
- A Parte B pode precisar ser enviada a mais de uma GCC. A resposta de A1.4
  informa a quais.
