# O que precisamos receber de cada empresa

Escrito em 28/10/2026, depois de Ariane solicitar orçamento a três empresas.

**Nada foi enviado, nada contratado.** Esta é a lista do que precisamos ter em
mãos para que a integração real deixe de depender de suposição.

A ordem das seções é a da auditoria: primeiro o que os adaptadores já exigem
por contrato interno, depois o que falta vir de fora.

---

## 1. Auditoria dos contratos internos — o que já está definido do nosso lado

Os adaptadores já declaram o que precisam. Cada linha abaixo é código, não
plano.

| Porta | O que o contrato interno já exige | Estado |
|---|---|---|
| `GCCProvider` | `createAuthorization({ subjectRef, purpose })` → referência **opaca** de auditoria. O token **nunca** sai do provider e **nunca** é persistido | só `FakeGCCProvider`; as variáveis estão nomeadas no `TODO(GCC-REAL)` |
| `DatavalidProvider` | `validateIdentity({ subjectRef, authorizationRef })` → veredito por campo, **sem valores**. A resposta bruta não sai da classe, não é logada, não é persistida | `DatavalidSerproProvider` recusa com `DATAVALID_NOT_IMPLEMENTED`; timeout e normalização de HTTP já prontos |
| `SenatranProvider` | `validateDriver({ subjectRef })` → situação, categoria, restrições, impedimento. `hasImpediment: null` é estado legítimo | só `FakeSenatranProvider`; mTLS é **hipótese**, não requisito confirmado |

**O que já está implementado e é confirmado pela especificação oficial**, sem
depender de resposta comercial:

- **consentimento pedido só do que vai.** `parametrosDoCorpo` deriva os
  parâmetros do corpo **já podado**. Confirmado pelo próprio serviço, que
  devolve a lista fechada no HTTP 400 — e pelo 422 que apanhamos quando o
  pedido não casava com o enviado;
- **código fora da tabela é recusado, nunca convertido.** Confirmado pela
  ausência de tabela de domínio publicada para `possui_impedimento`;
- **leitura por bloco**, preservando a semântica original: booleano diz que o
  valor **enviado confere**, não que a pessoa está aprovada;
- **uma tentativa de emissão**, sem repetição após possível envio;
- **auditoria sem documento, biometria, token ou payload**, com barreira que
  recusa montar o evento.

**O que NÃO foi implementado, de propósito:** autenticação, renovação e
expiração de token para produção. Não há como escrevê-las sem o contrato de
cada API, e inventar um endereço de token para "deixar pronto" produziria
código que parece funcionar e não funciona. Fica isolado em cada adaptador,
atrás das portas acima.

---

## 2. O que pedir ao fornecedor do **Datavalid** (SERPRO ou revenda)

| # | Item | Por que é bloqueante |
|---|---|---|
| 1 | **Documentação e OpenAPI do ambiente contratado** | três fontes oficiais divergem no endereço do template RFB; o OpenAPI é o que o servidor atende |
| 2 | **URLs de homologação e de produção** | o adaptador recusa qualquer destino que não seja o configurado; hoje só conhece o de demonstração |
| 3 | **Mecanismo de autenticação**: endereço do token, formato da credencial, validade, renovação, e se há limite de tokens simultâneos | é o que falta para `DatavalidSerproProvider` sair do `NOT_IMPLEMENTED` |
| 4 | **Credenciais por canal seguro**, separadas por ambiente | entram só no backend; nunca no repositório, nunca em log |
| 5 | **Massa de teste do ambiente de homologação** | a massa pública tem as cinco CNHs vencidas e a biometria com similaridade 0,001 |
| 6 | **Limites**: requisições por minuto, por dia, tamanho máximo de imagem, requisitos da captura (resolução, formato, compressão, enquadramento) | sem isso a captura fica provisória |
| 7 | **Tabela de erros**, versionada, e o procedimento para valor de domínio não publicado | nossa esteira **recusa** código desconhecido; precisamos confirmar que é a postura certa |
| 8 | **Preços**: por requisição, por sondagem, por não correspondência, por erro 4xx; franquia e mínimo | decide se a sondagem de situação da CNH é viável |
| 9 | **Contato técnico** e SLA para divergência entre documentação e comportamento | já temos divergências registradas para levar |

---

## 3. O que pedir à **GCC credenciada**

Mensagem separada, porque o SERPRO não responde pelo contrato dela.

| # | Item | Por que é bloqueante |
|---|---|---|
| 1 | **Comprovação do credenciamento** junto à SENATRAN | é a exigência da Portaria nº 139/2025 |
| 2 | **Documentação e OpenAPI** | não há especificação pública que possamos assumir |
| 3 | **URLs de homologação e produção** | — |
| 4 | **Mecanismo de autenticação**, validade e renovação | — |
| 5 | **Credenciais por canal seguro**, por ambiente | — |
| 6 | **Escopo e validade da autorização**: um titular, uma finalidade, um conjunto de campos, uma operação? Reutilizável dentro da validade? | define se `createAuthorization` é por operação ou por sessão — muda o fluxo inteiro |
| 7 | **Idempotência da emissão**: existe chave? reenvio emite de novo? | hoje emitimos **uma vez** e paramos no desfecho desconhecido; precisamos saber se há como reconciliar |
| 8 | **Vocabulário de parâmetros** aceito, e se cobre o bloco RFB | o vocabulário público do SERPRO não tem prefixo `rfb.` |
| 9 | **Retirada de consentimento**: canal, se invalida autorização já emitida, se somos notificados, prazo de propagação | do nosso lado uma credencial emitida vale até expirar; não podemos prometer revogação que não existe |
| 10 | **Trilha de auditoria**: o que guardam, por quanto tempo, se temos consulta, e quem fornece evidência em questionamento | — |
| 11 | **Limites e tabela de erros**, versionadas | — |
| 12 | **Preços**: por autorização, por titular ou assinatura; emissão recusada é cobrada? | — |
| 13 | **Contato técnico** e SLA | — |

---

## 4. O que fica pendente de resposta, e o que isso bloqueia

| Pendente | Bloqueia | Enquanto não vier |
|---|---|---|
| Escopo e validade da autorização da GCC | desenho de `GccHttpProvider` | não se escreve o adaptador real |
| Mecanismo de autenticação de cada API | ciclo de token nos dois adaptadores | nenhum endereço é inventado |
| Endereço do template RFB | registro do template | nenhuma das três variantes é fixada |
| Requisitos da captura | tela de captura definitiva | a captura atual é provisória e está declarada como tal |
| Faturamento por sondagem | decisão D3 (situação atual da CNH) | o bloco de habilitação fica **inconclusivo**, que é o comportamento correto |
| Procedimento para domínio não publicado | tratamento de resposta desconhecida | recusamos o código, em vez de converter por suposição |

**Nada disso bloqueia o que está em curso.** Consentimento, envio e
processamento de demonstração não dependem de fornecedor — e é por isso que
foram feitos primeiro.

---

## 5. O que não fizemos, e por quê

Não inventamos endereços, nomes de campo ou prazos para "deixar pronto". Um
adaptador escrito contra um contrato imaginado passa nos próprios testes e
falha na primeira chamada real — e pior, dá a impressão de que a integração
está adiantada.

O que está escrito é o que a especificação oficial confirma. O resto está
nesta lista, esperando resposta.
