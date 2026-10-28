# Ligação do fluxo — proposta

Escrita em 27/10/2026 contra `main` em `a263e5f`.

**Proposta, não implementação.** Nada foi construído nesta rodada: nenhuma
tela, nenhuma rota, nenhum job, nenhuma migration aplicada. O documento existe
para ser aprovado ou corrigido **antes** de qualquer código, e para que os
requisitos de staging isolado sejam confirmados antes — não depois.

Endereça as limitações L4 a L9 de
[`datavalid-gcc-requisitos-para-ligar.md`](./datavalid-gcc-requisitos-para-ligar.md).

---

## 1. O problema, em uma frase

Os módulos existem e são testados; **nada os chama.** Medido:

```
grep -rn "server/documents" src/ | grep -v src/server/documents/   → 1 linha, e é comentário
grep -rn "verifyDriverFn"  src/ | grep -v src/server/verification/ → nenhuma linha
```

A proposta é a ponte, e só a ponte. Não reescreve lógica aprovada, não muda
esquema, não troca fornecedor.

---

## 2. As cinco etapas

### E1. Consentimento

| | |
|---|---|
| **Existe hoje** | `document_consent_texts` e `document_consents` no banco, com versão e `sha256` do corpo. `consentStatus()` em `access.ts` decide o estado. Policy: o titular lê e grava o próprio aceite, ninguém aceita pelo outro |
| **Falta** | publicar o texto vigente; tela que o exiba; rota que grave o aceite com a versão e o `sha256` **do corpo exibido**, não do corpo presumido |
| **Regra que não pode ser perdida** | o aceite grava o hash do texto que a pessoa **viu**. Se o texto mudar, aceites antigos continuam válidos para a versão antiga — e é por isso que a coluna existe |
| **Homologável com demonstração?** | **sim, inteiramente.** Não toca fornecedor nenhum |

### E2. Envio

| | |
|---|---|
| **Existe hoje** | bucket privado `validation-documents`, caminho `<finalidade>/<titular>/<espécie>-<id>`, policies de `insert`/`select`/`delete` por caminho, `validation_documents` com `uploaded_at` e `validation_started_at` |
| **Falta** | tela de captura e envio de CNH e selfie; rota que registre a linha em `validation_documents` e o evento `upload` na trilha |
| **Regra que não pode ser perdida** | o caminho carrega o `subject_id` no segundo segmento. Ele **nunca** entra em log operacional — `conferirFalhaParaLog` recusa a entrada que o contenha |
| **Homologável com demonstração?** | **sim para o mecanismo** (envio, caminho, policy, trilha). **Não para a captura**: os requisitos técnicos da imagem aceita pelo Datavalid são pergunta A4.1 e ainda não foram respondidos. Até lá, captura é provisória |

### E3. Processamento

| | |
|---|---|
| **Existe hoje** | `verifyDriverFn` (server function, nunca invocada) → `DriverVerificationService` → portas GCC / Datavalid / SENATRAN → `decideDriverVerification` em `rules.ts`. O adaptador de demonstração (#16) fala com o ambiente oficial do SERPRO e lê a resposta por bloco |
| **Falta** | invocação a partir da tela; e, para o caminho real, os adaptadores L1 e L2 |
| **Regra que não pode ser perdida** | a fronteira devolve ao browser **somente** `{ status, decision, reasonCode }` e os blocos. Nenhuma resposta de provedor, nenhum código de provedor, nenhum dado pessoal. E fonte obrigatória ausente é **inconclusivo**, nunca aprovado |
| **Homologável com demonstração?** | **sim para a esteira inteira**, com o adaptador de demonstração: composição, impedimento não avaliado que impede aprovação, negativo, ausente. **Não para a decisão de produção** — a demonstração é mock, e o que ela devolve descreve o simulador |

### E4. Resultado e revisão

| | |
|---|---|
| **Existe hoje** | policy de admin em `validation_documents`; matriz `authorizeDocumentAccess` que decide **quem obtém** URL assinada; teto de 120 s em `TTL_MAXIMO_SEGUNDOS`, padrão 60 s, pedido acima do teto é **erro** |
| **Falta** | tela de resultado para o motorista; tela de revisão administrativa; **rota que emita a URL** aplicando a matriz e registrando `access` na trilha — sem a URL |
| **Decisão que esta etapa obriga a tomar** | **D4.** A matriz decide quem obtém a URL; não decide quem a usa depois de emitida. Medido: retirar o consentimento ou apagar o registro **não** derruba a URL já emitida (HTTP 200); só apagar o objeto derruba. Sem `jti` não há revogação. Alcançar de verdade exige servir o documento por rota própria, revalidando a cada leitura |
| **Homologável com demonstração?** | **sim.** É tudo nosso. A decisão D4 precisa ser tomada **antes** de a tela de revisão existir, não depois |

### E5. Retenção e expurgo

| | |
|---|---|
| **Existe hoje** | `document_retention_policy` que nasce **nula**, com `check` que recusa prazo sem aprovador; `avaliarExpurgo` que **lança** enquanto o prazo for nulo; `expurgarDocumento` e `expurgarLote` provados contra Storage de verdade; conclusão atômica no banco, com DV001/DV002 |
| **Falta** | **D1 aprovada** (prazo, aprovador, data) e um job agendado que chame `expurgarLote` |
| **Regra que não pode ser perdida** | expurgo não se declara concluído enquanto o arquivo persistir; a trilha é append-only e preservada; retirada de consentimento **não** é ordem automática de apagar |
| **Homologável com demonstração?** | **sim**, e já foi: 39 de 39 na execução de 27/10 contra Storage local. O que falta é a decisão D1, não a prova |

---

## 3. Quadro: demonstração × fornecedor real

| Etapa | Homologável com demonstração | Exige fornecedor real |
|---|---|---|
| E1 consentimento | tudo | — |
| E2 envio | mecanismo, caminho, policy, trilha | **requisitos técnicos da imagem** (A4.1) e SDK de captura, se houver (A4.3) |
| E3 processamento | esteira, composição, leitura por bloco, recusa de código desconhecido | **decisão válida**: credenciais, GCC contratada, adaptadores L1/L2 |
| E4 resultado e revisão | tudo | — |
| E5 retenção e expurgo | tudo | — |

**Quatro das cinco etapas não dependem de fornecedor nenhum.** A única que
depende é E3, e mesmo ela é exercitável de ponta a ponta contra a demonstração
— o que não se obtém sem fornecedor é **decisão com valor**, não o caminho.

Dito de outro modo: ligar o fluxo hoje produz uma esteira completa que, em E3,
responde por simulação declarada. Isso é um ganho real — tira L4 a L9 da lista
— e **não** é aprovação de ninguém.

---

## 4. Requisitos de staging isolado — **a confirmar antes de implementar**

Não implemento nada até estes pontos estarem confirmados por você. Estão aqui
como proposta, não como decisão tomada.

| # | Requisito | Proposta | Precisa de |
|---|---|---|---|
| S1 | **Destino** | pilha Supabase local descartável, nova e exclusiva para a ligação do fluxo — projeto, diretório, volumes e portas próprios, como foi feito para `fcgprova13` | autorização de portas, conferidas contra as faixas excluídas do Windows imediatamente antes de configurar |
| S2 | **Instância proibida** | `iaabxrclxpsagdijkrcx` continua negada, inclusive para consulta, pelas seis barreiras do validador | nada — já vale |
| S3 | **Dados** | somente massa sintética. Nenhum CPF, nome, imagem ou documento de pessoa real. Para E3, somente a massa fictícia oficial do ambiente de demonstração | confirmação de que nenhum dado real entra, nem para "testar de verdade" |
| S4 | **Credenciais** | `VERIFICATION_PROVIDER_MODE=fake` para E1, E2, E4, E5; adaptador de **demonstração** para E3. Nenhuma credencial de sandbox ou produção | confirmação de que não há configuração de provider nesta fase |
| S5 | **Migrations** | nenhuma migration nova é necessária — o esquema do #13 já cobre as cinco etapas. Se alguma for, é **incremental**, aplicada só no descartável, nunca remota | confirmação; e, se surgir necessidade de esquema, uma rodada própria |
| S6 | **Retenção** | o prazo no descartável é **de teste**, declarado como tal, e não vira proposta de produção por repetição | D1 continua pendente e separada |
| S7 | **Publicação** | nada vai para produção. O PR da ligação fica aberto até você decidir; a Vercel publicará o preview, que é comportamento normal do repositório | confirmação de que preview publicado é aceitável nesta fase |
| S8 | **Escopo do PR** | um PR por etapa, ou um só? Proposta: **E1+E2 num PR**, **E4 noutro**, **E5 noutro** — E3 só depois de D4 e das respostas de A4 | sua escolha |

**A pergunta que mais muda o trabalho é S8.** As demais são confirmações; essa
é uma decisão.

---

## 5. Ordem proposta

1. **D1** (retenção aprovada) — não depende de fornecedor e destrava E5 e o job.
2. **D4** (servir por rota própria ou não) — decide o desenho de E4 antes de a
   tela existir. Tomada por omissão, vira dívida permanente.
3. **E1 + E2** no descartável — as duas que não dependem de decisão nenhuma.
4. **E4** depois de D4.
5. **E5** depois de D1.
6. **E3** por último, contra a demonstração, e só até onde a demonstração
   permite.

---

## 6. O que esta proposta **não** inclui

- Nenhuma configuração de provider, sandbox ou produção.
- Nenhuma migration remota.
- Nenhum documento real, em nenhuma etapa.
- Nenhuma mensagem a fornecedor.
- Nenhuma decisão sobre D1 ou D4 — ambas são suas.
- Nenhuma ativação de funcionalidade em produção: ligar o fluxo no descartável
  não liga nada para usuário. A distinção está no §7 do documento de
  requisitos, nas três classes de evidência.
