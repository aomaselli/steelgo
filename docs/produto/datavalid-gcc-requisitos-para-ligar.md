# Datavalid e GCC reais — requisitos restantes

Levantado em 27/10/2026 contra `main` em `a263e5f`, depois da integração de
#12, #14, #13 e #16.

**Rascunho para aprovação de Ariane.** Nada contratado, nada configurado,
nenhuma mensagem enviada, nenhuma migration aplicada, nenhuma funcionalidade
ativada.

---

## 0. Correção de um erro cometido neste levantamento

Um rascunho anterior deste documento, da manhã de 27/10/2026 e nunca
versionado, abria com a frase **"a GCC é o bloqueio real, não o Datavalid"**.
Está errada, e o erro não é de ênfase — é de método. Fica registrada aqui
porque a conclusão errada é mais fácil de repetir do que de reencontrar.

O que de fato se sabe: a GCC é **uma dependência obrigatória identificada**,
sem alternativa interna, pela Portaria SENATRAN nº 139/2025. O que a frase
indevidamente acrescentava: que ela seria *o* bloqueio, como se o resto
estivesse pronto atrás dela.

Não está. Também faltam:

- o **adaptador Datavalid real** — `DatavalidSerproProvider.validateIdentity`
  recusa com `DATAVALID_NOT_IMPLEMENTED` antes de qualquer `fetch`;
- as **credenciais** de um ambiente contratado, que não existem;
- a **captura homologada** de selfie e documento — nenhuma tela existe;
- a **ligação ao fluxo** — `verifyDriverFn` é `createServerFn` e **nenhuma tela
  a invoca**; nenhum arquivo fora de `src/server/documents/` referencia aquele
  módulo.

E o argumento que a frase usava como prova provava outra coisa. A fábrica
recusar inicializar em `sandbox` e `production` enquanto a GCC for simulada
**comprova que a proteção do código funciona**. Não comprova prontidão
contratual, nem que o resto esteja pronto. Uma barreira que segura a porta diz
que a porta está trancada — não diz que a casa está construída.

---

## 1. Como ler este documento

Quatro categorias, porque misturá-las foi o que produziu a frase corrigida
acima:

| § | Categoria | Quem resolve |
|---|---|---|
| 2 | Obrigações **contratuais e regulatórias** | fora da SteelGo: SENATRAN, SERPRO, GCC |
| 3 | **Limitações da implementação atual** | engenharia, sem depender de terceiro |
| 4 | **Decisões pendentes da SteelGo** | Ariane, jurídico, produto |
| 5–6 | Requisitos de **homologação** e de **produção** | sequência, não lista |

Fonte de fato: código citado por caminho,
[`infraestrutura-versus-ligado.md`](../homologacao/infraestrutura-versus-ligado.md),
[`dependencias-por-capacidade.md`](./dependencias-por-capacidade.md),
[`datavalid-v5-matriz-capacidades.md`](./datavalid-v5-matriz-capacidades.md).

Documentos irmãos desta rodada:

- [`datavalid-perguntas-serpro-e-gcc-rascunho.md`](./datavalid-perguntas-serpro-e-gcc-rascunho.md)
  — as duas mensagens propostas. As referências `A…` e `B…` deste documento
  apontam para as perguntas de lá.
- [`ligacao-do-fluxo-proposta.md`](./ligacao-do-fluxo-proposta.md) — a proposta
  de ligar consentimento → envio → processamento → resultado → retenção, que
  endereça as limitações L4 a L9.

---

## 2. Obrigações contratuais e regulatórias

Nenhuma destas é resolvível por código.

**Cada linha declara se a obrigação está confirmada e, quando não está, qual
fonte falta.** A distinção importa: "o código diz que precisa" não é o mesmo
que "o contrato exige". Tratar hipótese registrada em comentário como requisito
confirmado foi o erro que produziu a frase corrigida no §0.

| # | Obrigação | Estado | Confirmada? | Fonte que falta |
|---|---|---|---|---|
| C1 | **Credenciamento da SteelGo junto à SENATRAN** | não iniciado | **não** | o termo ou regulamento de credenciamento. O cabeçalho de `datavalid.provider.ts` lista isto como "pré-requisito confirmado", mas `dependencias-por-capacidade.md` registra que essas três linhas **não foram conferidas contra o contrato**. Pergunta A7.2 ao SERPRO |
| C2 | **Contrato com o SERPRO — Datavalid V5**, com ambiente de homologação e de produção | não iniciado | **sim** — é o fornecedor escolhido | — |
| C3 | **Contrato com uma GCC credenciada pela SENATRAN** | não iniciado | **sim** | Portaria SENATRAN nº 139/2025. Registro próprio **não substitui**. É a única obrigação deste quadro confirmada por norma citável |
| C4 | **Registro do template de tratamento RFB** no ambiente contratado | depende de C2 | **sim** quanto à existência; **não** quanto ao endereço | o OpenAPI do ambiente contratado. Três variantes divergentes entre webinar, guia e Swagger — pergunta A7.4 |
| C5 | **mTLS com certificado ICP-Brasil e-CNPJ**, se a Consulta Online SENATRAN entrar | não iniciado | **não** | a **especificação técnica de integração da Consulta Online SENATRAN** (RENACH / RENAVAM / RENAINF), ou o termo de credenciamento correspondente. **Ninguém aqui leu nenhum dos dois.** A única base hoje é o comentário de `senatran.provider.ts`: *"Provavelmente exige mTLS com certificado ICP-Brasil e-CNPJ"* — hipótese registrada em código, não requisito confirmado |
| C6 | **Base legal e aviso de privacidade revisados por jurídico** para o tratamento biométrico | rascunho em `docs/lgpd/aviso-privacidade-motorista-v1.md`, não aprovado | **sim** quanto à obrigação; **não** quanto ao conteúdo | parecer do jurídico |

### Sobre C5, especificamente

A confirmação **não virá do SERPRO nem da GCC** — a Consulta Online é
integração distinta do Datavalid, com credenciamento e canal próprios. Por isso
ela não entrou nas duas mensagens preparadas: pedir a um fornecedor que
confirme requisito de outro produz resposta de cortesia.

Consequência prática: **C5 não entra em nenhum caminho crítico enquanto for
hipótese.** O bloco B (situação da habilitação) tem duas saídas — D3 decide
entre sondagem dentro do Datavalid e fonte própria — e só a segunda faz C5
existir. Comprar certificado antes dessa decisão é comprar requisito não
confirmado.

C3 não tem alternativa interna. C4 esbarra na divergência de endereço entre
três fontes oficiais; **não fixar nenhuma variante na implementação antes de
conferir o OpenAPI do ambiente contratado**.

---

## 3. Limitações da implementação atual

O que falta de código, com o estado de hoje citado.

### 3.1 Adaptadores que não chamam ninguém

| # | Item | Arquivo | Estado hoje |
|---|---|---|---|
| L1 | **Datavalid real** | `providers/datavalid.provider.ts` | `validateIdentity` retorna `DATAVALID_NOT_IMPLEMENTED` antes de qualquer `fetch`. Já resolvidos: leitura de configuração server-side, `AbortController` com timeout, `normalizeHttpStatus`. Falta tudo do `TODO(DATAVALID-REAL)`, passos 1 a 5 |
| L2 | **GCC real** | `providers/gcc.provider.ts` | só existe `FakeGCCProvider`. O `TODO(GCC-REAL)` já nomeia as variáveis: `GCC_BASE_URL`, `GCC_CLIENT_ID`, `GCC_CLIENT_SECRET` |
| L3 | **Consulta Online SENATRAN** | `providers/senatran.provider.ts` | só existe `FakeSenatranProvider`. `TODO(SENATRAN-REAL)` nomeia `SENATRAN_BASE_URL`, `SENATRAN_CLIENT_ID`, `SENATRAN_CLIENT_SECRET`, `SENATRAN_CLIENT_CERT_P12_BASE64`, `SENATRAN_CLIENT_CERT_PASSWORD`. **As duas últimas pressupõem C5, que não está confirmado** — não implementar o transporte mTLS antes da especificação |

> **Segunda correção do mesmo rascunho.** Ele dizia que as variáveis da GCC
> estavam "a definir". Não estão: os nomes estão escritos nos `TODO` desde
> antes desta rodada. O que falta é o serviço, não a nomenclatura.

### 3.2 Nada está ligado ao fluxo

Esta é a limitação que a versão anterior **omitiu por inteiro**, e é a maior.

| Camada | #12 verificação | #13 documentos | #14 semântica | #16 demonstração |
|---|---|---|---|---|
| Lógica testada | sim | sim | sim | sim |
| Esquema no banco | — | migration **merged**, não aplicada em banco remoto | — | — |
| Chamada por tela | **não** | **não** | **não** | só pelo harness |
| Chamada por rota ou RPC | **não** | **não** | **não** | **não** |
| Job agendado | — | **não existe** | — | — |

Medido, não suposto:

```
grep -rn "server/documents" src/ | grep -v src/server/documents/   → 1 linha, e é comentário
grep -rn "verifyDriverFn"  src/ | grep -v src/server/verification/ → nenhuma linha
```

| # | O que não existe | Consequência |
|---|---|---|
| L4 | **Tela de consentimento**, com texto vigente e sha256 do corpo | sem ela não há aceite para registrar |
| L5 | **Tela de envio** de CNH e selfie | sem ela não há documento para validar |
| L6 | **Rota que emite URL assinada** aplicando `authorizeDocumentAccess` e registrando `access` na trilha | a matriz existe em `access.ts` e ninguém a chama |
| L7 | **Job agendado de expurgo** | `expurgarLote` existe e ninguém a chama; hoje roda só pelo harness |
| L8 | **Tela de revisão administrativa** | a policy de admin existe no banco, a tela não |
| L9 | **Invocação de `verifyDriverFn`** por qualquer tela ou rota | o fluxo de verificação não é alcançável por usuário |

### 3.3 Limitação de desenho já medida, não resolvida

| # | Limitação | Medida em |
|---|---|---|
| L10 | **URL assinada é credencial, não consulta autorizada.** Retirada de consentimento **não revoga** URL já emitida — a única revogação é apagar o objeto. Sem `jti`, não há lista de revogados. Mitigação atual: teto de 120 s | `scripts/homologacao/url-assinada-como-credencial.mjs`, 11/11 |
| L11 | **Captura não homologada.** A prova de vida está no próprio Datavalid (`biometria_facial.vivacidade`) — não é lacuna de fornecedor. Falta captura que atenda aos requisitos técnicos do serviço, que ainda não conhecemos | perguntas A4.1–A4.3 |

### 3.4 O que não se reaproveita do modo de demonstração

O adaptador de `demonstracao` (#16) é isolado **por módulo**:
`providers/index.ts` não o importa — só o harness de homologação importa.
`demonstracao` **nunca foi** valor do enum `VerificationProviderMode`, e
`MODOS_INTEGRACAO_REAL` continua `["sandbox", "production"]`.

Nada dele deve migrar para o caminho real por conveniência: o simulador emite
token de GCC cuja assinatura é a literal `.demo`, e a própria documentação do
SERPRO o marca como "APENAS EM DEMONSTRAÇÃO".

---

## 4. Decisões pendentes da SteelGo

Ninguém de fora responde por nós.

| # | Decisão | Por que ainda está aberta | Bloqueia |
|---|---|---|---|
| D1 | **Política de retenção** — prazo, aprovador, data | nasce nula por desenho; `document_retention_policy` tem `check` que recusa prazo sem aprovador. `avaliarExpurgo` **lança** enquanto for nula, e isso é proteção | L7, e tocar em documento real |
| D2 | **Limiares** de similaridade e de probabilidade biométrica | a recomendação é informação do SERPRO; a decisão é nossa | homologação do bloco A |
| D3 | **B3 — situação atual da habilitação**: aceitar sondagem de `situacao`/`data_validade` por comparação, ou exigir outra fonte | depende de A3.1 (uso previsto) e A6.2 (faturamento por valor sondado). A segunda saída faz C5 existir | bloco B |
| D4 | **Servir documento por rota própria**, revalidando a matriz a cada leitura, em vez de entregar credencial do Storage | é o único caminho que faz a retirada de consentimento alcançar o documento. A tela de revisão administrativa obriga a decidir | L8, L10 |
| D5 | **Procedimento de retirada de consentimento** | já decidido que **não** é ordem automática de apagar; falta o procedimento operacional escrito | operação |
| D6 | **Tratamento de resposta desconhecida do fornecedor** | hoje o mapa de demonstração **recusa** código fora da tabela em vez de converter por suposição. Confirmar que a mesma regra vale no caminho real, e o que a esteira faz com a recusa — perguntas A5.1–A5.2 | L1 |

---

## 5. Requisitos para **homologação**

Ordem em que as barreiras se sustentam. Nada aqui toca documento real.

| # | Requisito | Depende de |
|---|---|---|
| H1 | Ambiente de homologação do SERPRO com credenciais próprias, distinto do ambiente público de demonstração | C1, C2 |
| H2 | Template RFB registrado nesse ambiente, com o `id_template` devolvido | C4, resposta 2.1 |
| H3 | Contrato ou acesso de homologação de uma GCC credenciada | C3 |
| H4 | `GccHttpProvider` implementado (L2), com `simulated = false` | H3 |
| H5 | `DatavalidSerproProvider.validateIdentity` implementado (L1) | H1, H2, H4 — sem H4 não é testável em modo real |
| H6 | `VERIFICATION_PROVIDER_MODE=sandbox` com as variáveis do ambiente de homologação | H4, H5 |
| H7 | Telas de consentimento e de envio (L4, L5) em destino descartável | D1 |
| H8 | Rota de URL assinada (L6) e invocação de `verifyDriverFn` (L9) | H7 |
| H9 | Bateria ponta a ponta contra o ambiente de homologação, com massa fictícia | H6, H8 |

**Enquanto D1 não for aprovada, H7 em diante não deve sair do destino
descartável.** Documento real segue bloqueado.

---

## 6. Requisitos para **produção**

Tudo de §5, mais:

| # | Requisito | Observação |
|---|---|---|
| P1 | Contratos assinados: SERPRO (C2) e GCC (C3), em produção | homologação não autoriza produção |
| P2 | Credenciamento SENATRAN concluído (C1) | |
| P3 | `DATAVALID_BASE_URL`, `DATAVALID_CLIENT_ID`, `DATAVALID_CLIENT_SECRET`, `DATAVALID_RFB_TEMPLATE_ID` de **produção**, server-side | `DATAVALID_TIMEOUT_MS` tem padrão 10000; as quatro primeiras são obrigatórias e a fábrica aborta se faltar qualquer uma |
| P4 | `GCC_BASE_URL`, `GCC_CLIENT_ID`, `GCC_CLIENT_SECRET` de produção | |
| P5 | `VERIFICATION_PROVIDER_MODE=production` | a fábrica recusa `fake` em runtime de produção, e recusa qualquer provider simulado neste modo |
| P6 | **Política de retenção aprovada e gravada** (D1) | sem ela o expurgo recusa rodar — e sem expurgo não se coleta documento real |
| P7 | Aviso de privacidade aprovado pelo jurídico (C6) e texto de consentimento publicado com sha256 | |
| P8 | Job de expurgo agendado (L7) e monitorado | |
| P9 | Decisão D4 tomada, se a revisão administrativa entrar junto | |
| P10 | Fonte de situação atual da habilitação definida (D3) — ou aceitação explícita de que o bloco B fica **inconclusivo** | o motor já trata fonte obrigatória ausente como inconclusivo, não como aprovado |

---

## 7. Três classes de evidência, que não se substituem

"Verde" quer dizer coisas diferentes em cada classe, e a confusão entre elas é
o que faz um deployment parecer uma entrega.

| Classe | O que mede | Onde está registrada | O que **não** diz |
|---|---|---|---|
| **E1. CI** | o código compila e a bateria de testes passa, no SHA exato | GitHub Actions, workflow `verificar` | nada sobre publicação, nada sobre uso |
| **E2. Publicação** | o build foi gerado e a URL serve | Vercel, deployment de produção | nada sobre o que está alcançável dentro da aplicação |
| **E3. Funcionamento integrado** | o código conversa com serviço de verdade e produz o efeito esperado | harness de homologação, contra **pilhas locais descartáveis** | **nada em produção, e nada ligado à interface** |

### E1 — CI dos quatro merges

Workflow `verificar`, no push para `main`. Compilação, tipos e bateria de
testes do repositório.

| PR | Cabeça integrada | SHA na `main` | Execução |
|---|---|---|---|
| [#12](https://github.com/aomaselli/steelgo/pull/12) | `86a3454bd95cb91db2f6375b4a4cd7862c7acf9e` | `29049a8fc132aa3ea2ca7f50cd519b2d28c04f12` | [success](https://github.com/aomaselli/steelgo/actions/runs/40563479341) |
| [#14](https://github.com/aomaselli/steelgo/pull/14) | `648dc9fbe5fb5067796822807d4391d5abcd9571` | `12d2d9fb0a50223969ca2dc4f5c97dc4ce53aff5` | [success](https://github.com/aomaselli/steelgo/actions/runs/40563479341/job/122398418508) |
| [#13](https://github.com/aomaselli/steelgo/pull/13) | `a7a1e9a15ab1542d7f4b7c7de4b47f8637685881` | `db8853901fb77cde665034a0434e5bf7a1859c46` | [success](https://github.com/aomaselli/steelgo/actions/runs/40564859702/job/122403303109) |
| [#16](https://github.com/aomaselli/steelgo/pull/16) | `516a02cb1a21b1b23599110c45043bccb1af90ce` | `a263e5fa0f7fea23510b2bdb2f70b3d70fdd59d2` | [success](https://github.com/aomaselli/steelgo/actions/runs/40566717992/job/122409835822) |

Os quatro branches foram preservados nas cabeças exatas.

### E2 — Publicação na Vercel

Deployment de produção concluído para cada SHA. Mede que o build subiu e a URL
responde.

| SHA na `main` | Build | URL publicada |
|---|---|---|
| `29049a8…` | [BZBbsGtL…](https://vercel.com/steelgo/steelgo/BZBbsGtL39zmSN4ryScoyK8CEgjY) | [steelgo-kugpa0p20](https://steelgo-kugpa0p20-steelgo.vercel.app) |
| `12d2d9f…` | [Evz6MYF4…](https://vercel.com/steelgo/steelgo/Evz6MYF4fvQeBAxMqehMXZzS4gLC) | [steelgo-ih1qty40b](https://steelgo-ih1qty40b-steelgo.vercel.app) |
| `db88539…` | [CYrpx5W1…](https://vercel.com/steelgo/steelgo/CYrpx5W1pcR8eAKNSF51Bo6J8Y2x) | [steelgo-7l6sn6akx](https://steelgo-7l6sn6akx-steelgo.vercel.app) |
| `a263e5f…` | [3r9hVPiJ…](https://vercel.com/steelgo/steelgo/3r9hVPiJctkq91gBuHV6Ry8sLDpT) | [steelgo-9fz7ql8wp](https://steelgo-9fz7ql8wp-steelgo.vercel.app) |

Produção ativa: `https://steelgo-9fz7ql8wp-steelgo.vercel.app`.

**E2 não implica E3.** A URL serve a aplicação; dentro dela não há tela de
consentimento, de envio, nem invocação de `verifyDriverFn` (§3.2).

### E3 — Funcionamento integrado, e contra o quê

Tudo abaixo rodou contra **pilhas Supabase locais e descartáveis**, nunca
contra produção e nunca com documento real.

| Evidência | Resultado | Contra o quê | Registrada em |
|---|---|---|---|
| Migration final em **banco limpo**, com o registro no histórico na mesma transação | exit 0; histórico 87 → 88 | pilha `fcgprova13`, exclusiva | [`migration-13-banco-limpo.md`](../homologacao/migration-13-banco-limpo.md) |
| Bateria de acesso e invariantes | **37 de 37** | idem | idem |
| Comparação estrutural por **definição** (não por nome) entre a pilha de prova e a de trabalho | **104 linhas, idênticas** | idem | idem |
| Expurgo integrado, com falha e nova tentativa | 19 de 19 (09/10) · **39 de 39** na execução de 27/10, após DV001/DV002 | Storage local de verdade | [`infraestrutura-versus-ligado.md`](../homologacao/infraestrutura-versus-ligado.md) + execução desta rodada |
| URL assinada tratada como credencial | **11 de 11** | Storage local | [`infraestrutura-versus-ligado.md`](../homologacao/infraestrutura-versus-ligado.md) |
| Adaptador Datavalid em modo demonstração — execução ponta a ponta | **24 de 24** | **ambiente oficial de demonstração do SERPRO**, massa fictícia | [`datavalid-v5-demonstracao.md`](./datavalid-v5-demonstracao.md) |
| Idem, homologação estendida (QR Code, biometria com prova de vida, negativo, ausente, composição) | **35 de 35** | idem | idem |

**O limite de E3, dito explicitamente.** O ambiente de demonstração do SERPRO é
mock: o que ele aceita, recusa ou devolve descreve o simulador, não o contrato
de produção. Uma bateria verde contra ele prova que **nosso** lado se comporta
como projetado — não prova nada sobre o serviço real.

### O que nenhuma das três classes comprova

| | |
|---|---|
| que alguma migration tenha sido **aplicada** em banco remoto | nenhuma foi, nesta rodada nem antes. A instância `iaabxrclxpsagdijkrcx` segue sem acesso |
| que exista tela, rota ou job chamando o código | §3.2, medido por `grep` |
| que exista provider real para as barreiras deixarem passar | §3.1 |
| que exista prazo de retenção aprovado para o expurgo poder rodar | D1 |

---

## 8. Ordem sugerida

1. **C3** (GCC credenciada) e **C1 → C2** (credenciamento, SERPRO) — em
   paralelo. São os de maior prazo e não dependem de nós.
2. **D1** (retenção aprovada). Não depende de fornecedor nenhum e destrava L7,
   H7 e P6. É a decisão mais barata com maior efeito.
3. **L4, L5, L6, L9** — ligar o que já existe, em destino descartável. Também
   não depende de fornecedor.
4. **H4 → H5** quando C2 e C3 saírem.
5. **D3 / L3**, com a resposta de faturamento em mãos.
6. **D4**, junto com a tela de revisão administrativa.

Os itens 2 e 3 são os únicos que avançam hoje, sem nenhum terceiro.
