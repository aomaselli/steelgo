# Datavalid V5 — modo demonstração

Levantado e medido em 09/10/2026 contra o serviço oficial de demonstração.
Fonte primária: OpenAPI 3.0.1 do ambiente de demonstração, `info.version`
`2609181441.4140937`.

## Onde a documentação em prosa diverge do contrato

O contrato que o servidor atende é o OpenAPI. Três divergências encontradas, e
em todas elas o OpenAPI é o que vale.

### 1. O caminho do template

| Fonte | Caminho do POST |
|---|---|
| Webinar técnico V5 | `/v5/pessoa-fisica/privacidade/rfb/template-de-tratamento/` |
| Artigo "Registro do Template" | `/pessoa-fisica/privacidade/rfb/template-de-tratamento/` |
| Mesmo artigo, os dois GET | `/v5/pessoa-fisica/privacidade/rfb/template-de-tratamento/…` |
| **OpenAPI de demonstração** | **`/v5/pessoa-fisica/privacidade/rfb/template-tratamento`** |

Duas diferenças, não uma: o artigo omite o `/v5` no POST — e o contradiz na
mesma página — e **todas** as fontes em prosa escrevem `template-de-tratamento`
onde o contrato diz `template-tratamento`. Registrado com HTTP 201 no caminho
do OpenAPI.

### 2. O corpo do template

O artigo descreve `agente_de_tratamento` e `como_exercer_direitos` como texto
livre. O contrato diz:

- o campo é **`agente_tratamento`**, sem o `de`;
- `como_exercer_direitos` é **lista de enum**: `PRESENCIALMENTE`,
  `REQUISICAO_ELETRONICA`, `OUTRO`;
- obrigatórios: `agente_tratamento`, `como_exercer_direitos`, `eventos`,
  `finalidade`, `hipoteses_legais`;
- `hipoteses_legais` é enum: `PROTECAO_CREDITO`, `EXECUCAO_CONTRATO`,
  `INTERESSE_LEGITIMO`, `CONSENTIMENTO`, `PREVENCAO_FRAUDE`;
- dentro de `agente_tratamento`, obrigatórios: `cnpj`, `email`,
  `email_encarregado`, `nome`, `razao_social`.

### 3. O simulador de GCC responde texto puro

`POST /v5/gcc/token` — "Realiza a simulação de uma GCC, para criação de tokens
de validação (**APENAS EM DEMONSTRAÇÃO**)". A resposta 201 é `text/plain` com o
token. Pedir `Accept: application/json` devolve **406 Not Acceptable**; foi o
que a primeira execução ponta a ponta recebeu.

O token é um JWT `RS256` com payload `templateId, isConsentimento,
idConsentimento, cpf, cnpjUsuario, cnpjGcc, dataCriacao, dataExpiracao`,
validade de uma hora, e assinatura literal `.demo`. Não é autorização de GCC
credenciada, e o tipo `AutorizacaoSimulada` existe para que não possa ser
confundida com uma.

## O vocabulário de consentimento é mais estreito que a requisição

Este é o achado que mais muda o desenho.

`parametros`, em `/v5/gcc/token`, é uma **lista fechada** — o serviço a devolve
no corpo do HTTP 400 quando se manda um nome fora dela. E nela:

- não existe prefixo **`rfb.`**, embora `cnh.` e `endereco.` existam;
- **`situacao_cpf`, `nome_social` e `data_inscricao_cpf` não constam**, em
  nenhuma forma — e são exatamente os campos do bloco `validacao.rfb`.

Ou seja: a requisição aceita campos que o consentimento não cobre.

A regra que adotamos: **só se envia o que o consentimento autoriza.** Os três
campos do bloco RFB são omitidos e a omissão é relatada, com motivo
`SEM_PARAMETRO_DE_CONSENTIMENTO`. Mandá-los seria tratar dado sem base legal
declarada; pedir consentimento de um campo usando o nome de outro seria pior.

## Código sem tabela oficial é recusado

A massa fictícia oficial (`exemplos.json`, 5 registros, ~12 MB por causa da
biometria em base64) não está no formato da requisição. As tabelas de domínio
estão em "Campos Disponíveis", e só o que está nelas é traduzido:

| Massa | Requisição | Fonte |
|---|---|---|
| `sexo: "F"` | `FEMININO` | "F - feminino, M - masculino, O - outro" |
| `nacionalidade: "1"` | `BRASILEIRO` | "1 - brasileiro … 4 - brasileiro nascido no exterior" |
| `tipo_documento: "1"` | `RG` | "1 - carteira de identidade …" |
| `cnh_situacao: "3"` | `EMITIDA` | "2 - em emissão, 3 - emitida, A - cancelada" |
| `situacao_cpf: "regular"` | `REGULAR` | lista por extenso (só caixa difere) |
| `endereco_cep: "04766-900"` | `04766900` | sem máscara |
| **`cnh_possui_impedimento: "1"`** | **recusado** | tabela de domínio "-" — **não há tabela** |

O último é o que prova a regra. A requisição espera booleano; a massa traz
`"1"`; a documentação não publica tradução. Ler `"1"` como `true` é convenção
de programador, não contrato — e é o campo que, invertido, reprova um motorista
habilitado ou aprova um impedido. Ele é omitido, e o resultado volta sem a
comparação correspondente, que é a resposta honesta: não foi avaliado.

Em modo estrito o mapeador **lança** diante de código fora da tabela. Em modo
não estrito omite e registra o motivo. Em nenhum dos dois converte.

## A resposta aninha

Dentro de `cnh` vem um `endereco` com as comparações de logradouro, número,
bairro, CEP e município. A primeira versão do leitor não descia um nível e
essas comparações apareciam como "não classificadas" — lidas como ruído em vez
de resultado. O leitor desce um nível, que é o que o contrato tem.

## Barreiras do adaptador

- **Ambiente**: recusa inicializar com qualquer sinal de produção
  (`NODE_ENV`, `APP_ENV`, `VERCEL_ENV`) **e** recusa ambiente que não se
  declare local ou de teste. Ausência de sinal não é prova de que seja local.
- **Destino**: a URL é constante no código, não vem de variável de ambiente.
  O destino de produção está listado para ser recusado por nome, e a
  concatenação de caminho é conferida contra `..` e `//`.
- **Resultado**: todo resultado carrega `demonstracao: true` e
  `aprovaCadastroReal: false`, em literal. Nenhum chamador consegue tratá-lo
  como validação oficial sem alterar o tipo.
- **Repetição**: a validação **nunca** repete sozinha depois de a requisição
  possivelmente ter saído. Timeout e 5xx devolvem
  `repeticaoAutomaticaBloqueada`. A obtenção do token, que é *antes* do envio,
  pode repetir em falha transitória — e só nela: 4xx não repete.
- **Log**: lista fechada de campos permitidos, com nomes de campo e nunca
  valores. Recusa a entrada que contenha JWT, base64 longo, data URI, CPF,
  segredo ou URL com credencial. Corpo de erro não entra, porque pode ecoar o
  que foi enviado.
- **GCC**: `demonstracao` não entra em `MODOS_INTEGRACAO_REAL`. `sandbox` e
  `production` continuam recusando provider simulado e continuam recusando
  inicializar enquanto a GCC real for um fake.

## O que o 429 ensinou

Numa das execuções o serviço devolveu **HTTP 429**. É exatamente o status que
não consta das respostas documentadas deste endpoint, e sobre o qual uma versão
anterior de `privacy.ts` presumia "não processado". O adaptador fez o certo: não
repetiu sozinho e não afirmou nada sobre processamento. O bearer de demonstração
é público e compartilhado — limite de taxa é esperado, e esperar é a resposta.

## Credencial e massa não são versionadas

O bearer do ambiente de demonstração é publicado pelo próprio SERPRO. Mesmo
assim entra por `DATAVALID_DEMO_BEARER`: credencial publicada continua sendo
credencial. A massa entra por `DATAVALID_MASSA_OFICIAL`.

## Execução ponta a ponta

`scripts/homologacao/datavalid-demonstracao.mjs` — 24 de 24 asserções, com
template registrado (201), token simulado emitido, validação respondida (200) e
resultado lido por bloco. `rfb_existe=true`, `cnh_existe=true`, todas as
comparações verdadeiras e similaridades 1 — esperado, porque os dados enviados
vêm da própria massa da base.

Nada disso aprova cadastro real nem libera viagem.

## Homologação estendida — 35 de 35

Medida em 09/10/2026 por `scripts/homologacao/datavalid-demonstracao.mjs`.

| Cenário | Resultado medido |
|---|---|
| Biográfico e habilitação | `rfb_existe`/`cnh_existe` verdadeiros, comparações verdadeiras, similaridades 1 |
| QR Code da CNH | 16 campos **decodificados** (nome, filiação, categoria, RENACH, local e UF de emissão) além das comparações |
| Biometria facial com prova de vida | `vivacidade: "REAL"`, `disponivel: true`, `similaridade: 0.001`, `probabilidade: "Baixíssima probabilidade"` |
| Negativo | `nome_similaridade` caiu de 1 para 0,333; `data_nascimento` comparou falso |
| Ausente | `rfb_existe: false`, `cnh_existe: false`, blocos vazios |
| Composição | impedimento não avaliado → `manual_review/LICENSE_STATUS_UNCONFIRMED` |

### Prova de vida e identidade são perguntas diferentes

A biometria da massa passa na prova de vida (`REAL`) e **falha** na
correspondência facial (`0.001`). Ler as duas como uma só aprovaria quem está
vivo diante da câmera sem conferir se é quem diz ser — ou reprovaria por
vivacidade quem só tem foto de má qualidade. O leitor por bloco mantém as duas
separadas, e `vivacidade`/`probabilidade` chegam em `valores`, não num balde
de "não classificado".

### O impedimento não avaliado não aprova

Confirmado contra a resposta real e o motor de regras do #12: sem
`possui_impedimento` na resposta, `avaliarHabilitacao` devolve
`inconclusive/LICENSE_STATUS_UNCONFIRMED`, e `compor` com identidade
**aprovada** ainda assim devolve `manual_review`. Controle positivo: com
impedimento avaliado como falso, aprova.

Duas observações que vieram junto:

- **As cinco CNHs da massa oficial estão vencidas** (2022 a 2025). Com a data
  real, o bloco reprova por `LICENSE_EXPIRED` antes de chegar ao impedimento —
  correto, mas impede isolar a pergunta. O cenário usa validade futura
  declarada, e afirma antes que a da massa está vencida.
- O bearer público é **compartilhado e limitado por taxa**. Chamadas seguidas
  recebem 429. Esperar é a resposta; repetir automaticamente seria treinar a
  esteira a insistir contra um limite.

### Um 422 que era defeito nosso

Numa execução o QR Code recebeu **422**. A hipótese fácil era "QR Code sozinho
não vale"; duas sondas contra o serviço mostraram que sozinho vale (200). O
que não valia era o descasamento: `parametrosDoCorpo` descia no objeto
`qrcode` e produzia `qrcode.formato`, `qrcode.base64` — nomes que não existem
no vocabulário. O token saía sem autorizar `qrcode`, e a requisição o enviava.
A recusa do serviço estava certa.

`qrcode` e as biometrias são **folhas** do vocabulário: valem pelo nome
inteiro, e descer neles quebra tanto o consentimento quanto o corpo.

### O que não vira regra de produção

Nada do que a demonstração aceita, recusa ou devolve vale como contrato de
produção sem confirmação formal — inclusive o token de GCC com assinatura
`.demo`. As perguntas abertas estão em
[`datavalid-questoes-ao-serpro.md`](./datavalid-questoes-ao-serpro.md).

## Emissão de token: uma tentativa, e por quê

O teto de três tentativas que esta implementação teve por um tempo **limitava
o risco sem tornar a repetição segura** — são coisas diferentes, e tratá-las
como uma só foi o erro. Hoje a política é **uma tentativa**, declarada em
`TENTATIVAS_DE_EMISSAO`.

Repetir só seria seguro com garantia do serviço: de que a emissão não
aconteceu, ou de que repetir não emite de novo. O OpenAPI do simulador declara
**uma** resposta para `POST /v5/gcc/token` — 201 — e não documenta chave de
idempotência, comportamento em repetição nem reconciliação. Não há onde apoiar
a garantia.

Restaria repetir no caso **provadamente anterior ao envio**, onde daria para
afirmar que nada foi emitido. Esse caso não é distinguível aqui: `fetch` lança
o mesmo `TypeError` para falha de DNS (nada saiu) e para conexão interrompida
no meio (pode ter saído). A versão anterior tinha um ramo para ele que, por
isso, **nunca executava** — código morto que ainda sugeria uma distinção que o
módulo não consegue fazer.

Todo desfecho que não seja emissão carrega `garanteAusenciaDeEmissao: false` e
`emissoesPossivelmenteOrfas`. O desconhecido carrega também
`repeticaoAutomaticaBloqueada: true`. Repetir é decisão de quem chama, com os
olhos abertos para as emissões possivelmente órfãs.

**Se um dia o SERPRO publicar essa garantia**, o lugar de registrá-la é no
comentário de `pedirAutorizacaoSimulada`, com a citação — e só então o `return`
vira `continue`.

### Isto vale para o SIMULADOR, não para a GCC real

O simulador existe só na demonstração, e a própria documentação o marca assim.
A GCC real é contratada, credenciada pela SENATRAN, e cada token que emite é
registro de consentimento e ciência do titular, visível no Portal de
Privacidade. **Nada medido contra o simulador autoriza repetir contra ela**, e
nenhuma garantia que o simulador venha a publicar vale para ela.

## A validade futura do cenário 6 é entrada sintética

`FUTURA_SINTETICA` é calculada como hoje + 365 dias, na própria linha do
harness. **Não vem do SERPRO, não está na massa oficial e não foi confirmada
por ninguém.** Existe só para o bloco de habilitação passar do portão de
vencimento, de modo que a única pergunta em aberto seja o impedimento.

O dado real da massa é o da asserção 6.2 — `2025-04-03`, vencido. A asserção
6.4 nomeia a data sintética no próprio texto, para que nenhuma leitura do
relatório a tome por resultado da validação.
