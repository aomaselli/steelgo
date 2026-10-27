# Datavalid V5 — matriz de capacidades e correções

> **Documento não versionado.** Análise para revisão; as correções de código
> são propostas, não aplicadas.

Fontes lidas em 09/10/2026:

| | Arquivo |
|---|---|
| **W** | `webinar-tecnico-datavalid-v5.pdf` |
| **R** | Referência da API / Swagger (Demonstração, OAS v5) |
| **G** | Guias rápidos |

O que segue é lido nessas três. Onde elas divergem, a divergência está
registrada em vez de resolvida por escolha minha.

---

## 1. Quatro coisas diferentes que a API faz — e uma que ela não faz

A distinção abaixo é o eixo de todo o resto. Confundi-las leva a acreditar que
o Datavalid aprova motorista, e ele não aprova.

### 1.1 Validação por **comparação**

Você **envia** um valor; a API diz se ele bate com a base oficial. É o modo
dominante da V5.

- Campos booleanos: `situacao`, `data_validade`, `categoria`,
  `possui_impedimento`, `data_nascimento`, `sexo`, `cep`, `uf`…
- Campos de similaridade: `nome_similaridade`, `nome_mae_similaridade`,
  `observacoes_similaridade`… (percentual).

A documentação é explícita (G):

> *"o Datavalid processa apenas os dados que foram enviados pelo contratante"*

**Consequência prática, e é o alerta central deste documento:** `situacao: true`
não significa "a CNH está regular". Significa **"o valor de `situacao` que você
enviou confere com a base"**.

No exemplo oficial (G), a requisição envia `"possui_impedimento": true` e a
resposta devolve `"possui_impedimento": true`. Lido como aprovação, isso seria
exatamente ao contrário: a resposta confirma que **há** impedimento.

### 1.2 **Extração / decodificação** — QR Code da CNH

Aqui a API **devolve o valor**, não um booleano. Campos `*_decodificado` em
`QRCodeResult` (R): `numero_registro_decodificado`, `categoria_decodificada`,
`data_validade_decodificada`, `data_primeira_habilitacao_decodificada`,
`nome_decodificado`, `numero_renach_decodificado`, `local_emissao_decodificado`…

O mesmo objeto traz também os booleanos e similaridades de comparação. São
coisas distintas na mesma resposta.

**Limite:** o QR Code carrega o que está **no documento**. Uma suspensão
posterior à emissão não aparece ali.

### 1.3 **Existência** na base

`rfb_existe` e `cnh_existe` (R): o CPF existe na Receita Federal, e existe no
Renach. É existência, não situação.

### 1.4 **Decisão operacional — nossa**

A documentação devolve isso para o contratante, em dois pontos (G, R):

> *"cabendo ao contratante decidir sobre a utilização dos resultados"*
> *"A biometria não é um recurso determinístico"*

É o `rules.ts`. A API relata; quem decide somos nós.

### 1.5 O que **não** existe: consulta de situação

Não há, no endpoint unificado, um retorno que diga "a CNH está regular hoje".
Dá para **sondar** — enviar `situacao: "EMITIDA"` e ler o booleano — mas isso é
comparação contra uma hipótese nossa, não consulta. Sondar enumeração inteira é
frágil e cada chamada é cobrada.

**Esta é a lacuna que não se fecha pela simples presença dos campos de CNH.**

---

## 2. A matriz

| # | Requisito SteelGo | Endpoint / campo | Significado do retorno | Contratação / captura | Lacuna restante |
|---|---|---|---|---|---|
| A1 | CPF existe e está regular | `POST /v5/pessoa-fisica/validacao` → `rfb_existe`, `rfb.situacao_cpf` | `rfb_existe`: existência. `situacao_cpf`: **comparação** com o valor enviado (ex.: `"REGULAR"`) | OAuth2 + template RFB + token GCC | Nenhuma, se adotarmos a sondagem `"REGULAR"` → `true` |
| A2 | A pessoa é quem diz ser (dados) | `validacao.nome`, `data_nascimento`, `nome_mae`… → `*_similaridade` e booleanos | Comparação, com percentual para texto | idem | Limiar de similaridade é **decisão nossa** |
| A3 | A selfie é da pessoa | `validacao.biometria_facial` → `biometria_facial.{probabilidade, similaridade}` | **Probabilístico**, não determinístico | Captura conforme *Face — requisitos e orientações* | Limiar de aceite é decisão nossa |
| A4 | A selfie é de pessoa presente | `biometria_facial.vivacidade = true` → `FaceLivenessResult.vivacidade` | Prova de vida **existe na V5** | Ler *Prova de vida — requisitos e orientações*; alternativas: App Datavalid, BioConnect | **Fornecedor adicional não é necessário** |
| B1 | A CNH declarada confere com o Renach | `validacao.cnh.*` → `cnh_existe` + booleanos | **Comparação.** Pega divergência e erro de digitação | idem A1 | Não diz a situação por si |
| B2 | Ler os campos reais da CNH | `validacao.qrcode` → `*_decodificado` | **Extração** do documento | Captura conforme *QRCode — requisitos e orientações* | Reflete o documento, não a base de hoje |
| B3 | A CNH está válida **hoje** | — | — | — | **Lacuna real.** Só por sondagem de `situacao`/`data_validade`, ou outra fonte |
| C | RNTRC | — | — | — | Fora do Datavalid |
| D | Veículo / CRLV | — | — | — | Fora do Datavalid |
| E | Apólice | — | — | — | Fora do Datavalid |

### Pré-requisitos, todos distintos e todos obrigatórios

Não são alternativas entre si (W, G):

| Requisito | O que é | Onde entra |
|---|---|---|
| **Credenciamento SENATRAN** | aprovação da empresa | pré-condição do contrato |
| **Contrato com GCC credenciada** | entidade credenciada pela SENATRAN | pré-condição, **contratação obrigatória** |
| **HASH/token da GCC** | **por operação**, não reutilizável | `privacidade.senatran.token` |
| **Template de tratamento RFB** | registro único por finalidade, devolve um ID | `privacidade.rfb.id_template` |
| **OAuth2** | `POST https://gateway.apiserpro.serpro.gov.br/token`, Bearer de 1 h | header `Authorization` |

> (W): *"Requisições sem o objeto privacidade corretamente preenchido serão
> rejeitadas pelo Datavalid V5."*

**Nota de nomenclatura:** o campo chama-se `privacidade.senatran.token`, mas o
que ele carrega é o **HASH/token da GCC**. Junto vai `cnpj_anuente`.

---

## 3. Correções ao que escrevi antes

### 3.1 "GCC, ou registro próprio" — **errado**, e preciso retirar

Escrevi em `dependencias-por-capacidade.md` que C1 poderia ser "GCC, **ou
registro próprio**", e levantei a Q4 perguntando se bastaria nosso
consentimento. A documentação responde que não:

- a GCC é *"entidade **credenciada pela SENATRAN** responsável por registrar,
  gerenciar e auditar os eventos de consentimento e ciência"* (W);
- *"Toda empresa cliente do Datavalid V5 **deve contratar** uma GCC credenciada
  antes de iniciar as validações"* (W);
- a exigência vem da **Portaria SENATRAN nº 139/2025** (W, G);
- o token é **por operação** e não reutilizável entre validações (W).

Nosso registro interno de consentimento, ciência ou auditoria **não substitui a
GCC**. São coisas diferentes com finalidades diferentes: o nosso serve à nossa
prestação de contas; o da GCC é o registro formal exigido pela regulação, e o
SERPRO valida o token na requisição.

**A Q4 sai.** Não é pergunta em aberto.

### 3.2 Prova de vida não é lacuna

Escrevi que C4 era *"a lacuna com maior incerteza"* e que provavelmente exigiria
fornecedor novo. **Está coberta**: `vivacidade: true` no objeto
`biometria_facial` (R), com fluxos "Biométrica Facial com Prova de Vida Simples"
e "Composta". Há ainda App Datavalid e BioConnect para a captura.

**A Q3 sai.**

### 3.3 CNH: a Q1 se responde, mas a cobertura **não se encerra**

Escrevi que, se o contrato incluísse o módulo de CNH, o bloco B estaria
resolvido e a Consulta Online SENATRAN deixaria de ser necessária. A primeira
metade está certa: os campos de CNH estão no endpoint unificado, sem contrato
separado.

A segunda metade era precipitada. Os campos de CNH respondem **por comparação**.
Confirmar que a CNH declarada confere com o Renach **não é** confirmar que ela
está válida hoje. **B3 continua em aberto** e precisa de decisão: sondagem de
valores, ou outra fonte.

### 3.4 Divergência do endereço do template — **três** variantes

| Fonte | Endereço |
|---|---|
| **W** webinar | `POST /v5/pessoa-fisica/privacidade/rfb/template-de-tratamento/` |
| **G** guia rápido | `POST /pessoa-fisica/privacidade/rfb/template-de-tratamento/` |
| **R** Swagger | `/v5/pessoa-fisica/privacidade/rfb/template-tratamento` |

Duas diferenças independentes: **`template-de-tratamento` × `template-tratamento`**,
e presença ou ausência do prefixo `/v5`.

**Não fixar nenhum na implementação antes de conferir o contrato OpenAPI do
ambiente contratado.** O Swagger é a fonte mais próxima do contrato, mas é da
Demonstração; webinar e guia são material didático. A diferença entre eles
devolve 404 — que, pela própria tabela de erros (R), é
*"Verifique se o endereço acessado é válido para a API/versão"*.

---

## 4. Correções de código propostas — **não aplicadas**

Nenhuma destas foi feita. Renomear componente depende da sua aprovação.

| # | Onde | Proposta | Motivo |
|---|---|---|---|
| P1 | `providers/gcc.provider.ts`, `providers/index.ts` | manter o nome **`gcc`** | Antes eu havia anotado a divergência doc × código como inconsistência a corrigir. **Era eu que estava errado:** GCC é o nome da entidade regulatória, e o slot está certo |
| P2 | `datavalid.provider.ts` | trocar `authorizationRef` por algo que carregue `id_template` **e** token GCC | Hoje o provider recebe um `authorizationRef` só. São dois identificadores distintos, de origens distintas |
| P3 | `rules.ts` | não tratar booleano de CNH como aprovação | O motor hoje usa `DriverStatusResult.licenseValid`. Precisa saber que booleano é **comparação** |
| P4 | `types.ts` | separar `IdentityValidationResult` em comparação, extração e probabilístico | A similaridade e a probabilidade biométrica têm limiar; o booleano não |
| P5 | `dependencias-por-capacidade.md` | aplicar 3.1 a 3.4 | documento tem erro factual sobre a GCC |
| P6 | — | registrar **B3** como lacuna aberta | evitar que "campos de CNH existem" seja lido como cobertura |

---

## 5. O que fica pendente de confirmação com o fornecedor

Reduzido, e agora com pergunta precisa:

1. **Endereço do template** no ambiente contratado — qual das três variantes.
2. **B3**: a sondagem de `situacao`/`data_validade` por comparação é uso
   previsto e aceitável, ou existe caminho próprio para situação de habilitação?
3. **Faturamento**: cada sondagem conta como requisição? Decide se a sondagem é
   viável.
4. **Limiares** de similaridade e de probabilidade biométrica recomendados — a
   decisão é nossa, mas a recomendação é informação deles.

Nada disso bloqueia a **Etapa 1**, que não depende de fornecedor.
