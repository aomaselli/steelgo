# Freight Compliance Gate — Fase 1A: limitações atuais

**Status de cada item abaixo: comportamento implementado, pendente de decisão de
Ariane.** Nenhum deles foi aprovado. Estão aqui para que a decisão seja
consciente e não por omissão. Não remova um item sem registrar a decisão.

---

## 1. Replay por outro ator autorizado devolve `22023`, não `42501`

`public.create_transport_operation_from_contract_core` inclui o ator na
impressão canônica dos parâmetros. Quando um segundo ator — **também parte do
contrato, portanto autorizado** — reapresenta o mesmo `request_id` com os mesmos
parâmetros de negócio, a divergência aparece como conflito de parâmetros
(`22023`), e não como "request_id pertence a outro ator" (`42501`).

O efeito é correto: a chamada é recusada e nenhum id é devolvido. A **semântica**
é menos precisa que a de `public.rpc_idempotency_probe`, que distingue os dois
casos.

Decisão pendente: manter o colapso em `22023`, ou separar os casos como a base faz.

## 2. Falha do próprio mecanismo de auditoria perde o registro

Em `fcg_contract_observational_hook`, a gravação em `public.fcg_observational_log`
está dentro de um bloco protegido. Se **ela** falhar, a falha é engolida e resta
apenas o `RAISE WARNING` no log do servidor.

A prioridade declarada é não bloquear a contratação. O código **não oferece**
garantia de registro nesse cenário, e o teste
`fcg_failure_containment.sql` (cenário B) documenta isso como limite, não como
garantia.

Decisão pendente: aceitar a perda do registro, ou exigir um canal de auditoria
que não dependa da mesma transação.

## 3. Evidência do RNTRC é comparada byte a byte

A impressão usa `public.rpc_params_fingerprint`, que serializa o `jsonb`. O
`jsonb` normaliza ordem de chaves, duplicatas e espaços, mas **não** normaliza
números: `{"a":1.0}` e `{"a":1.00}` produzem impressões diferentes, assim como
`1` e `1.0`.

Duas evidências logicamente equivalentes, gravadas com formatação numérica
diferente, são tratadas como parâmetros divergentes e geram conflito.

Decisão pendente: manter a comparação estrita, ou normalizar numéricos com
`trim_scale` antes de imprimir — o que tornaria evidências distintas no byte
elegíveis a replay.

## 4. Trilha de revisão administrativa fechada a toda a aplicação

`public.regulatory_compliance_review_events` não tem `grant` para `anon` nem
`authenticated`, e não tem policy de `SELECT`. **Nenhum papel da aplicação lê
essa tabela — nem admin.** O fluxo de revisão não está disponível na aplicação.

Decisão pendente: manter restrita ao backend, ou abrir com `grant` e policy
explícitos, junto com a tela que a consumir.

## 5. Numeração de contratos por contagem (F6)

`public.generate_contract_number` usa `SELECT count(*)+1`, não sequência.
Qualquer exclusão de contrato faz o contador reemitir um número já usado,
violando `contracts_contract_number_key`; `operational_trips.trip_number` herda
o problema.

**Defeito pré-existente, de 2026-05-23, fora do escopo da Fase 1A.** Nenhuma
migration do gate toca a numeração. Diagnóstico e proposta de correção em
`SteelGo-Fase0/correcao-f1f2f3-20260928/DIAGNOSTICO-F6-numeracao-de-contratos.md`.

Decisão pendente: agendar rodada própria — a correção altera numeração visível
ao cliente.

---

## Limites de cobertura de teste

- O ramo de ambiguidade do validador de destino (`fcg_target_guard.ps1`) está
  coberto por inspeção de código, não por execução: o Docker impede nomes
  repetidos e uma colisão de prefixo de 12 dígitos hexadecimais não é
  reproduzível localmente.
- `fcg_phase1_checks.sql` e `fcg_observational_mode.sql` foram alterados em
  rodadas anteriores sem que a pré-imagem fosse preservada. O conteúdo final
  consta do patch completo contra o HEAD; o histórico intermediário desses dois
  arquivos não é reconstruível.
