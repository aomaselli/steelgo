# Questões abertas ao SERPRO — Datavalid V5

Levantadas em 09/10/2026 contra o ambiente oficial de demonstração
(OpenAPI `2609181441.4140937`) e a documentação pública.

**Nenhuma destas respostas pode ser inferida do comportamento da
demonstração.** O ambiente de demonstração é mock: o que ele aceita, recusa
ou devolve descreve o mock, não o contrato de produção. Enquanto não houver
resposta formal, o adaptador opera pela leitura mais restritiva — que é a que
erra para o lado de não tratar dado sem base.

---

## 1. O vocabulário de consentimento não cobre o bloco RFB

**A constatação.** `POST /v5/gcc/token` valida `parametros` contra uma lista
fechada, que o próprio serviço devolve no corpo do HTTP 400:

```
biometria_digital, biometria_facial, cnh.categoria,
cnh.data_primeira_habilitacao, cnh.data_ultima_emissao, cnh.data_validade,
cnh.numero_registro, cnh.observacoes, cnh.possui_impedimento,
cnh.registro_nacional_estrangeiro, cnh.situacao, cpf, data_nascimento,
endereco.bairro, endereco.cep, endereco.complemento, endereco.logradouro,
endereco.municipio, endereco.numero, endereco.uf, nacionalidade, nome,
nome_mae, nome_pai, numero_documento_origem,
orgao_expedidor_documento_origem, qrcode, sexo, tipo_documento_origem,
uf_expedidor_documento_origem
```

Há prefixo `cnh.` e `endereco.`. **Não há prefixo `rfb.`**, e os três campos do
bloco `validacao.rfb` do endpoint de validação — `nome_social`,
`situacao_cpf`, `data_inscricao_cpf` — **não aparecem em forma alguma**, nem
com prefixo nem sem.

**O descasamento.** `POST /v5/pessoa-fisica/validacao` aceita
`validacao.rfb.{nome_social, situacao_cpf, data_inscricao_cpf}` e devolve
comparação para eles. O token de consentimento não tem como autorizá-los.

**As perguntas.**

1. Os campos do bloco RFB estão **fora do escopo** do consentimento por
   decisão — por já serem cobertos pelo template de tratamento RFB, que é
   registrado à parte — ou é lacuna do vocabulário?
2. Se estão cobertos pelo template, enviar `validacao.rfb.*` sem parâmetro
   correspondente no token é o comportamento **esperado** em produção?
3. Há nome de parâmetro previsto para eles que não conste da lista devolvida
   pelo 400?

**O que fazemos enquanto não há resposta.** Não enviamos os três. A omissão é
registrada com motivo `SEM_PARAMETRO_DE_CONSENTIMENTO` e a comparação volta
não avaliada. Enviar campo que o token não autoriza seria tratar dado sem base
declarada; presumir que o template cobre seria decidir por conta própria uma
questão de base legal.

---

## 2. Divergências entre a documentação em prosa e o OpenAPI

Em todas, o OpenAPI é o que o servidor atende. A pergunta é qual das duas vale
como contrato.

### 2.1 Caminho do registro de template

| Fonte | Caminho |
|---|---|
| Webinar técnico V5 | `POST /v5/pessoa-fisica/privacidade/rfb/template-de-tratamento/` |
| Artigo "Registro do Template" | `POST /pessoa-fisica/privacidade/rfb/template-de-tratamento/` |
| Mesmo artigo, os dois GET | `GET /v5/pessoa-fisica/privacidade/rfb/template-de-tratamento/…` |
| **OpenAPI de demonstração** | **`/v5/pessoa-fisica/privacidade/rfb/template-tratamento`** |

Duas diferenças: o artigo omite o `/v5` no POST — e se contradiz na mesma
página — e **todas** as fontes em prosa escrevem `template-de-tratamento`
onde o contrato diz `template-tratamento`.

### 2.2 Corpo do template

O artigo descreve `agente_de_tratamento` e `como_exercer_direitos` como texto
livre. O OpenAPI declara `agente_tratamento` (sem o `de`) e
`como_exercer_direitos` como **lista de enum**
(`PRESENCIALMENTE`, `REQUISICAO_ELETRONICA`, `OUTRO`).

### 2.3 Tipo de conteúdo do simulador de GCC

`POST /v5/gcc/token` responde `text/plain` com o token puro.
`Accept: application/json` devolve **406**. A documentação em prosa não
menciona o tipo de resposta.

---

## 3. Códigos sem tabela de domínio publicada

A massa oficial (`downloads/exemplos.json`) traz `cnh_possui_impedimento` como
código numérico. "Campos Disponíveis" lista `possui_impedimento` com tabela de
domínio **"-"** — isto é, sem tabela —, enquanto a requisição espera booleano.

**A pergunta.** Qual é a tradução oficial? `"1"` significa "possui" ou é
código de outra coisa?

**O que fazemos enquanto não há resposta.** Não enviamos o campo. É o campo
que, lido ao contrário, reprova motorista habilitado ou aprova impedido, e a
convenção de que `1` é verdadeiro não está publicada em lugar nenhum.

---

## 4. Observações sobre a massa de demonstração

Não são perguntas de contrato, mas afetam quem homologa.

- **As cinco CNHs da massa estão vencidas** (validades de 2022 a 2025). Uma
  esteira que reprove por vencimento antes de qualquer outra verificação — como
  a nossa — não consegue exercitar o caminho aprovado sem substituir a data.
- A **biometria facial** da massa devolve `vivacidade: "REAL"` com
  `similaridade: 0.001` e `probabilidade: "Baixíssima probabilidade"`. Prova de
  vida e correspondência facial são perguntas diferentes, e na massa só a
  primeira passa. É esperado?
- O bearer público de demonstração é **compartilhado e limitado por taxa**.
  Uma homologação com poucas chamadas seguidas recebe 429 com facilidade.

---

## 5. O que NÃO se conclui daqui

O ambiente de demonstração aceita um token de GCC cuja assinatura é literal
`.demo`, emitido por um simulador que a própria documentação marca como
"APENAS EM DEMONSTRAÇÃO". **Isso não é indício de que produção aceite
qualquer coisa parecida**, e o adaptador não trata como se fosse: o modo
`demonstracao` é separado, e `sandbox`/`production` continuam recusando
inicializar enquanto a GCC for simulada.

Pelo mesmo motivo, nenhum comportamento observado na demonstração — o que ela
aceita, o que recusa, os valores que devolve — vira regra do contrato de
produção sem confirmação formal.
