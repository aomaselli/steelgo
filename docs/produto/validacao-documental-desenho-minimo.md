# Validação documental — desenho mínimo

**Bloqueia:** viagem real, junto com
[`docs/homologacao/aparelho-real-antes-do-piloto.md`](../homologacao/aparelho-real-antes-do-piloto.md).

**Isto é desenho, não implementação.** Nada aqui foi construído; nenhuma
integração foi publicada. Levantado em 08/10/2026 sobre o código em `main`.

O ponto de partida: **há mais código pronto do que parece, e nenhuma integração
homologada**. A seção 1 separa as três coisas, porque confundi-las é o jeito
mais rápido de acreditar que o sistema valida alguém.

---

## 1. Código pronto, simulado e homologado — a separação

### 1.1 Código pronto (real, testado, sem dependência externa)

| Peça | O que é |
|---|---|
| `src/server/verification/types.ts` | tipos internos; `VERIFICATION_RULE_VERSION = "2026.08.27-r1"` |
| `src/server/verification/rules.ts` | motor de decisão puro, determinístico |
| `src/server/verification/driver-verification.service.ts` | orquestração consentimento → identidade → habilitação |
| `src/server/verification/driver-verification.repository.ts` | persistência da trilha |
| `src/server/verification/masking.ts` | mascaramento para log |
| `DatavalidSerproProvider.normalizeHttpStatus` | tradução de HTTP para falha interna — real e testável |
| `providers/index.ts` | fábrica com guarda-trilho de modo |
| `public.driver_verifications` | trilha append-only garantida por trigger |

20 testes passando em `__tests__/driver-verification.service.test.ts`.

**Regra central, já estabelecida e boa:** nada nos tipos espelha formato de
SERPRO, GCC ou SENATRAN. Cada provider traduz a resposta externa **dentro do
provider**. Service, repository, server function e browser nunca veem payload
externo.

**Lacuna estrutural:** `grep` por `driver-verification` fora do módulo não
retorna nada. O backend existe e **nenhuma tela o chama**.

### 1.2 Providers simulados (fakes)

| Fake | Cenários |
|---|---|
| `FakeDatavalidProvider` | 8: `match_high`, `match_medium`, `field_mismatch`, `no_match`, `low_confidence`, `unavailable`, `timeout`, `unauthorized` |
| `FakeGCCProvider` | concessão/recusa de autorização |
| `FakeSenatranProvider` | situação da CNH |

São bons fakes: cobrem o caminho do código. **Não cobrem o contrato da fonte.**

### 1.3 Stub que recusa — nem pronto, nem simulado

`DatavalidSerproProvider.validateIdentity` devolve sempre:

```
{ ok: false, failure: { kind: "unavailable",
                        resultCode: "DATAVALID_NOT_IMPLEMENTED",
                        retryable: true } }
```

Deliberado, e certo: enquanto a integração real não existe, **recusa
explicitamente em vez de simular sucesso silencioso**. O corpo real está em
comentário, com a ordem dos passos e a instrução de não inventar payload.

### 1.4 Integrações efetivamente homologadas

**Nenhuma.** Zero fontes externas contratadas e homologadas. Todo o resto deste
documento parte disso.

---

## 2. Três defeitos a corrigir antes de qualquer `enforcing`

Encontrados lendo o código, não em execução — o módulo não roda em lugar nenhum
ainda. São critérios de aceitação das etapas, não bugs em produção.

### 2.1 Fake embutido no modo produção

`providers/index.ts` tem o guarda-trilho certo:

```js
if (mode === "fake" && isProdRuntime) { throw new Error(...) }
```

Mas ele só barra o **modo**. Nos modos `sandbox` **e** `production`, a fábrica
ainda devolve:

```js
gcc: new FakeGCCProvider("granted"),   // TODO(GCC-REAL)
senatran: null,                        // TODO(SENATRAN-REAL)
```

Ou seja: em produção, a autorização da GCC seria **falsamente concedida**. O
guarda-trilho não pega fake embutido dentro do modo real.

### 2.2 SENATRAN ausente não bloqueia

`rules.ts`, comentário no próprio código:

```
// 5. SENATRAN é opcional hoje: ausente não bloqueia; indisponível não reprova.
```

A distinção está meio certa: `driverStatusFailure` (provedor fora do ar) vira
`provider_error`, correto. Mas `senatran === null` — que é o estado de produção
hoje — faz o passo ser **pulado em silêncio**, e o fluxo pode chegar a
`approved` sem nenhuma conferência de habilitação na fonte.

### 2.3 A proteção de hoje é acidental

Nada aprova ninguém em produção neste momento — mas só porque
`DatavalidSerproProvider` recusa com `NOT_IMPLEMENTED` antes de a GCC falsa
importar. **É ordem de implementação, não garantia.** Se o Datavalid real for
ligado antes da GCC real, o sistema passa a aprovar motorista com autorização
inventada.

> **Invariante que precisa ser testada, não presumida:** nenhum fake pode ser
> selecionado em produção — nem pelo modo, nem embutido —, e erro ou ausência de
> fornecedor nunca pode produzir `approved` nem liberar viagem.

---

## 3. O que já existe e deve ser reusado

**A trilha de auditoria.** `public.driver_verifications`: uma linha por evento
concluído, append-only por trigger, `on delete restrict` no `driver_id` para o
histórico não sumir junto com o motorista. O cabeçalho da migration já declara o
que nunca entra ali: CPF, CNH, selfie, biometria, payload do Datavalid, resposta
do SENATRAN, token da GCC, bearer do SERPRO. **Reusar esta tabela para todos os
blocos** — não criar trilha paralela.

**Estado corrente** continua em `drivers.license_verification_status`. Sem
máquina de estados paralela.

**Consentimento versionado** — o padrão já foi provado nesta homologação, com
`privacy_notices` + `drivers.privacy_notice_version` / `_sha256` /
`_acknowledged_at`, inclusive no caso difícil de republicação com viagem em
curso. Reusar **a forma**, não a tabela: o consentimento do Datavalid é outro
ato, com outra finalidade.

**Storage privado com acesso auditado** — `trip-media` privado +
`request_trip_media_access` + `trip_access_log`, com matriz de acesso
comprovada (partes acessam, terceiros recebem 42501). É o molde exato para CNH e
selfie. Hoje **não existe bucket para documento de motorista**.

**Portão de conformidade** — `src/lib/complianceGate.ts`: categorias RNTRC
(`tac`/`etc`/`ctc`), códigos de motivo, e os modos `observational` →
`enforcing`.

**Campos que existem e ninguém valida:** `carriers.antt_rntrc`,
`carriers.insurance_expiry`, `carriers.rctr_c_active`, `trucks.plate`. Texto
digitado, nenhum conferido contra fonte.

---

## 4. Os seis blocos, separados

Separados porque prazos, fontes e consequências diferem. Um bloco reprovado não
derruba os outros.

| | Bloco | Fonte | Validade |
|---|---|---|---|
| A | **Identidade** — a pessoa é quem diz ser | Datavalid V5 + GCC | identidade não expira; **prova de vida sim** |
| B | **Habilitação** — CNH válida e regular | SENATRAN | até o vencimento, com reconferência |
| C | **RNTRC / transportadora** — pode transportar carga de terceiro | ANTT | validade própria do RNTRC |
| D | **Veículo** — placa regular e adequada à carga | a definir | CRLV anual |
| E | **Seguros** — carga coberta | apólice / seguradora | vencimento da apólice |
| F | **Aptidão para a viagem** — o portão | composição de A–E | avaliada por viagem |

F não é validação nova: é a composição das cinco, com as validades vigentes
**na data da viagem**.

---

## 5. Etapas de implementação

Estimativas em dias de trabalho de uma pessoa, **sem contar espera por
contrato ou homologação de terceiro** — que é o que costuma dominar o prazo.

---

### Etapa 1 — Proteção dos documentos e consentimento

Pré-requisito de tudo. Não depende de contrato nenhum, e é o que permite tocar
em documento real depois.

**Escopo:** bucket privado para documento de motorista, no molde do
`trip-media`; RPC de acesso auditado; captura de CNH e selfie na tela; registro
de consentimento versionado (texto, versão, sha256, aceite), carimbado em cada
verificação que dele depende; política de retenção por tipo de dado.

**Critérios de aceitação**

- [ ] Bucket privado, sem leitura anônima; matriz de acesso provada como a do
      `trip-media` — titular e revisor acessam, terceiro recebe 42501.
- [ ] Todo acesso a documento fica registrado, com quem e quando.
- [ ] Nenhum caminho por URL adivinhável; nenhum documento em bucket público.
- [ ] Sem consentimento vigente, o fluxo não chama provedor nenhum — o motor já
      devolve `CONSENT_NOT_GRANTED`.
- [ ] Republicação do texto de consentimento invalida o aceite anterior e a
      tela oferece o novo. **Testar o caso em verificação já iniciada**, que foi
      onde o padrão análogo quebrou na viagem.
- [ ] Retenção decidida e escrita por tipo: selfie e prova de vida (prazo mais
      curto), imagem da CNH, trilha de auditoria (dura mais que o dado, e por
      isso não guarda o dado).
- [ ] Expurgo implementado e exercitado, não só documentado.
- [ ] **Só dados sintéticos até aqui.**

**Dependências externas:** texto do consentimento, com jurídico; política de
retenção, com jurídico. Sem fornecedor.

**Estimativa:** 5–8 dias. O expurgo e a matriz de acesso são o grosso.

---

### Etapa 2 — Datavalid e prova de vida em sandbox

**Escopo:** `DatavalidSerproProvider` real contra o sandbox do SERPRO; GCC real;
escolha e integração do provedor de prova de vida; fechar os defeitos 2.1 e 2.2.

**Critérios de aceitação**

- [ ] **Nenhum fake selecionável em produção**, nem pelo modo nem embutido: a
      fábrica recusa inicializar se qualquer provider for instância de fake e o
      runtime for produção. Teste de regressão que falha se alguém reintroduzir
      um `Fake*Provider` no ramo de produção.
- [ ] **Provedor ausente não aprova.** `senatran === null` passa a produzir, no
      máximo, `manual_review` — nunca `approved`. Hoje é pulado em silêncio.
- [ ] Erro, timeout ou indisponibilidade de fornecedor produz `provider_error`;
      nunca `approved`, nunca `rejected`. Já é assim; manter sob teste.
- [ ] Bearer do SERPRO nunca persistido, nunca logado, nunca retornado.
- [ ] Payload externo não sai do provider — verificado por teste, não por
      inspeção.
- [ ] Os 8 cenários do fake reproduzidos contra o sandbox real, com os mesmos
      códigos internos.
- [ ] `rfbTemplateId` e credenciais exclusivamente do ambiente server-side.
- [ ] **Ainda só dados sintéticos.** Documento real só depois da Etapa 1
      verificada *e* desta aqui aprovada em sandbox.

**Dependências externas:** contrato SERPRO; credenciamento SENATRAN (exigido
pelo Datavalid V5); GCC contratada com credenciais de sandbox; **provedor de
prova de vida ainda não escolhido**; ambiente de sandbox de cada um.

**Estimativa:** 8–12 dias de código. A seleção e contratação do provedor de
prova de vida é o item de maior incerteza — pode dominar o calendário.

---

### Etapa 3 — Resultados, idempotência e indisponibilidade

**Escopo:** ligar o módulo à tela em modo **observacional** (registra, não
bloqueia); exibir resultado e motivo ao motorista e ao revisor; fila de revisão
manual; idempotência completa.

**Critérios de aceitação**

- [ ] Modo observacional registra tudo e **não impede nada**.
- [ ] Chave de idempotência por (motorista, tipo, janela): reenvio de
      formulário, retomada do app ou duplo toque não geram consulta nova nem
      linha nova. Hoje só há o atalho de "já aprovado não reconsulta".
- [ ] Indisponibilidade de fornecedor é visível como tal ao motorista — não
      como reprovação. É o mesmo erro que a tela de convites cometia com o 403.
- [ ] Fila de revisão manual com decisão registrada (`decided_by = 'admin'`).
- [ ] Nenhum código de fornecedor externo chega ao browser; só
      `InternalReasonCode`.
- [ ] Período observacional com volume real antes de qualquer bloqueio.

**Dependências externas:** nenhuma nova. Depende da Etapa 2 para ter resultado
verdadeiro que exibir.

**Estimativa:** 6–9 dias.

---

### Etapa 4 — Transportadora, veículo e seguros

**Escopo:** blocos C, D e E. Conferência de RNTRC contra a ANTT; placa e CRLV;
apólice contra o que foi digitado, e cobertura contra `cargo_value_brl`.

**Critérios de aceitação**

- [ ] Cada bloco grava na **mesma** `driver_verifications` (ou extensão direta
      dela), append-only, sem payload externo. Nenhuma trilha paralela.
- [ ] Mesma distinção de falha: fonte fora do ar nunca reprova.
- [ ] Cada documento tem validade e reconferência antes do vencimento.
- [ ] Onde não houver fonte automática, **conferência manual registrada vale** —
      e fica explícito na interface que é manual.
- [ ] Cobertura do seguro comparada ao valor da carga, com o resultado legível.

**Dependências externas:** canal de consulta ANTT/RNTRC **não definido**; fonte
veicular **não definida**; conferência de apólice **não definida** — pode
começar manual.

**Estimativa:** 4–6 dias por bloco com fonte definida; 2–3 dias por bloco na
forma manual registrada. As definições de fonte são o bloqueio real.

---

### Etapa 5 — Bloqueio de atribuição por aptidão da viagem

**Escopo:** bloco F. O portão que compõe A–E no momento de atribuir motorista e
veículo a uma viagem.

**Critérios de aceitação**

- [ ] Avalia com as validades vigentes **na data da viagem**, não na data da
      última verificação.
- [ ] Produz aprovado / pendente / reprovado com os códigos de motivo de cada
      bloco — nunca um "não" sem motivo.
- [ ] Respeita `observational` → `enforcing` do `complianceGate.ts`: observa
      primeiro, bloqueia depois, com evidência do período observacional.
- [ ] **Indisponibilidade não libera viagem.** Se um bloco não pôde ser
      avaliado, o resultado é pendente e a atribuição não passa — o inverso do
      que acontece hoje com `senatran === null`.
- [ ] Bloqueio exercitado na interface, com a recusa legível para a
      transportadora.
- [ ] Nenhum caminho de contorno: o portão vive no servidor, não na tela.

**Dependências externas:** nenhuma nova. Depende de A–E existirem.

**Estimativa:** 5–7 dias.

---

## 6. Regra de dados ao longo de toda a homologação

1. **Começa sintético.** Etapas 1 e 2 inteiras com dados sintéticos — contas
   `@steelgo.invalid`, CPFs de teste, selfies geradas.
2. **Documento real só depois** de os controles de privacidade e segurança da
   Etapa 1 estarem *verificados*, não apenas implementados: matriz de acesso
   provada, expurgo exercitado, consentimento funcionando com troca de versão.
3. **Nenhum documento real no destino descartável**, em hipótese alguma.
4. O primeiro documento real é de alguém da própria equipe, com consentimento
   explícito e com a opção de expurgo imediato exercida ao fim do teste.

---

## 7. O que este desenho deliberadamente não faz

- Não propõe tabela nova antes de a fonte estar definida.
- Não propõe guardar documento ou biometria na trilha de auditoria.
- Não propõe bloquear viagem antes do período observacional.
- Não substitui a homologação em aparelho real; são requisitos paralelos, e a
  viagem real depende dos dois.
