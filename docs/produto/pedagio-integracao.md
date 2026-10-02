# Integração de pedágio — estado, escolha de provedor e o que falta

Pedágio é custo real do frete e entra na proposta e no contrato. Este documento
registra o que já existe, o que foi possível verificar sobre os candidatos, o
que foi implementado e o que depende de contratação.

A construção serve ao aço **e às demais cargas**: nada no módulo depende de
`steel_type`.

---

## 1. O que já existe e foi reaproveitado

Levantado no banco e no código antes de escrever qualquer linha nova.

| Peça existente | O que já cobre |
|---|---|
| **`route_estimates`** | `provider`, `provider_route_id`, `loaded_distance_km`, `empty_distance_km`, `duration_minutes`, **`toll_amount`**, `currency_code`, **`border_crossings`** (jsonb), **`route_payload`** (jsonb), `calculated_at`, **`expires_at`** |
| **`freight_quotes`** | decomposição completa: `toll_amount`, `border_amount`, `fuel_surcharge_amount`, `risk_amount`, `insurance_amount`, `waiting_amount`, `platform_fee_amount`, `shipper_total_amount`, `calculation_breakdown`, `status`, **`valid_until`**, `accepted_at` |
| Proposta e contrato | `bids.toll_brl`, `freights.toll_included` — pedágio já trafega da proposta ao contrato |
| Rota | `origin_geog`/`destination_geog` (PostGIS), lat/lng, `waypoints` jsonb, `distance_km`, `operation_scope`, código de país, subdivisão, CEP e fuso nas duas pontas |
| Veículo | `trucks` com `type` (enum `truck_type`), `max_weight_tons`, `payload_tons`, `body_type`, `country_code`, `regulatory_attributes` |
| Composição | `transport_operation_vehicle_units.axle_count` — **só na Fase 1A, ainda não aplicada em produção** |
| Padrão de integração | Vault + `net.http_post` + Edge Function (`push-dispatch`), com HMAC, tabela de nonce e outbox com lease — padrão de saída externa já provado |
| Multimoeda e multipaís | `currency_code` e `country_code` em 18 tabelas |

**As duas tabelas de cotação estão vazias e não têm nenhum escritor** — nem
função de banco, nem código em `src/`. Foram construídas e nunca ligadas.

### Lacunas identificadas

1. **Nenhuma integração de provedor.** `route_estimates.provider` nunca foi preenchido.
2. **Quantidade de eixos não existe em produção.** `trucks` não tem `axle_count`; a composição com eixos está na Fase 1A, pendente de aplicação. **Sem eixos não há tarifa.**
3. **Sem ligação** entre `route_estimates` → `bids.toll_brl` → contrato.
4. **Sem sinal de recálculo** quando rota ou veículo mudam.
5. **Vale-Pedágio não existe** em lugar nenhum do modelo.
6. **`freight_quotes` concede `arwdDxtm` a `anon`.** A migration `m3_legacy_security` revogou `anon` de `route_estimates` e das tabelas de capacidade, mas **deixou `freight_quotes` de fora**. As policies impedem leitura e DML por `anon`; o que sobra é o privilégio de `TRUNCATE`, que RLS não cobre. Severidade prática baixa pelo REST, mas é omissão numa migration cujo propósito declarado era "anon nunca". **Está em produção.**

---

## 2. AILOG e QualP

### Correção de um levantamento anterior

Uma versão anterior deste documento afirmou que **nenhuma das duas publica
documentação técnica aberta**. **Está errado.** A AILOG publica base de
conhecimento aberta, com requisição e resposta por endpoint:
`suporte.ailog.com.br/kb/category/modulo-roteirizador`. A QualP mantém portal
público em `docs.qualp.com.br`. O erro foi meu, por ter parado nas páginas
institucionais.

### Três estados distintos, que não devem ser confundidos

| Estado | Significado |
|---|---|
| **público e verificado** | li o campo ou o endpoint na documentação aberta |
| **não alcançado pela ferramenta** | a documentação existe, mas não cheguei ao detalhe com os recursos desta sessão |
| **não publicado / exige contratação** | a informação não é pública |

### AILOG — documentação pública, verificada

Base: `https://way-hml.webrouter.com.br/RouterService` (o `-hml` indica
**ambiente de homologação publicado na própria documentação**).

| Item | Estado |
|---|---|
| `POST /router/api/calcular` | **verificado** — cálculo de rota |
| `GET /router/rota/pedagios/{idRota}/{idxRota}` | **verificado** — endpoint dedicado às praças de pedágio |
| `GET /router/rota/find/{idRota}/{idxRota}`, `/findByCodigo/{codigoRota}` | **verificado** |
| **`quantidadeEixos`** | **verificado** — eixos são parâmetro de primeira classe |
| `ordemPassagem`, `idPedagio`, `nome` | **verificado** — praça identificada e ordenada no percurso |
| Resposta de `calcular` | **verificado** na descrição: "detalhes das praças em lista com todos os pedágios do percurso, rotograma e pontos de interesse" |
| Valor por praça | **não alcançado** — o trecho exibido não mostra o campo de valor |
| Autenticação | **não alcançado** — só consta `Content-Type: application/json` |
| Free Flow, validade de tarifa, restrições de rota, Vale-Pedágio | **não alcançado** nos artigos lidos |
| Custo | **não publicado** |

### QualP — portal público, detalhe não alcançado

| Item | Estado |
|---|---|
| Portal `docs.qualp.com.br` | **público** — lista Roteirizador, Tabela Frete, Geocode, Isochrone, Matrix, **Evitar Locais**, **Exceções de Rota**, Locais Privados |
| `POST https://api.qualp.com.br/rotas/v4` | **verificado** como endpoint |
| Parâmetros (eixos, veículo, data) | **não alcançado** — a página do serviço não foi encontrada (`/roteirizador` devolve 404) e `api.qualp.com.br/home` é tela de login |
| Detalhamento por praça, Free Flow | **não alcançado** |
| Restrições de rota | **indício público forte**: "Evitar Locais" e "Exceções de Rota" são serviços nomeados |
| Data retroativa | **indício público**: simular rota com condição histórica |
| Vale-Pedágio, CIOT | **não mencionados** publicamente |
| Custo | **público**: 1.000 consultas/mês R$ 390 a 25.000/mês R$ 9.000; faixas diferem no nº de locais por requisição (10/20/50); pedágio em todos os planos |

### Comparação técnica, com o que está verificado

Na **única dimensão hoje comparável com documentação aberta** — como o provedor
expressa eixos e praças — a **AILOG está à frente**: `quantidadeEixos` é
parâmetro documentado, há **endpoint dedicado a praças**, e existe **ambiente de
homologação publicado**. Da QualP, nada disso foi alcançado.

**Nenhuma recomendação de assinatura é feita aqui, e em particular não pelo
preço público.** Preço público é conveniência de contratação, não evidência
técnica. Os critérios que decidem — valor por praça, Free Flow, validade de
tarifa, restrições — continuam **não verificados nas duas**.

### Perguntas comerciais que faltam

Mesmo conjunto para as duas, para comparar em pé de igualdade.

| # | Pergunta |
|---|---|
| 1 | **Existe acesso de avaliação sem contratar?** Chave de homologação, período de teste ou cota gratuita. A AILOG publica base `-hml`; falta saber como obter credencial para ela |
| 2 | A resposta traz **valor por praça**, com nome, concessionária e ordem de passagem? |
| 3 | **Free Flow / pedágio sem cancela** é identificado como tal na resposta? |
| 4 | A tarifa tem **data de referência** e **validade**? É possível cotar para a data da viagem? |
| 5 | Há **restrição de rota por veículo** (altura, peso, PBT, carga perigosa) e isso muda o pedágio? |
| 6 | Há **histórico**: reconsultar a mesma rota e obter a tarifa vigente numa data passada? |
| 7 | **Cobertura**: quais países além do Brasil, e quais corredores LATAM? |
| 8 | **Vale-Pedágio Obrigatório**: integra com quais operadoras, e o que a plataforma precisa assumir? |
| 9 | **CIOT**: emite, e sob qual responsabilidade legal? |
| 10 | Limite de requisições, latência típica, SLA e comportamento em indisponibilidade |
| 11 | Preço por consulta e por volume (AILOG), e se o plano QualP cobre o detalhamento por praça |

### Credenciais e contratação necessárias

Nada contratado nem solicitado.

| # | Item | Depende de |
|---|---|---|
| 1 | **Acesso de avaliação** a AILOG e QualP (pergunta 1) | solicitação comercial; sem custo, se existir |
| 2 | `AILOG_API_BASE_URL`, `AILOG_CLIENT_ID`, `AILOG_CLIENT_SECRET` | item 1 |
| 3 | `QUALP_API_BASE_URL`, `QUALP_API_TOKEN` | item 1 ou assinatura |
| 4 | Tarifas oficiais do corredor do piloto | ANTT / concessionárias |
| 5 | Operadora de Vale-Pedágio | decisão jurídica e comercial |

---

## 3. O que foi implementado

`src/server/toll/`, espelhando o desenho já validado de
`src/server/verification`.

| Arquivo | Papel |
|---|---|
| `types.ts` | `ProviderOutcome` (falha nunca vira valor), `TollAmount` com `known: false`, praça, configuração veicular, resultado público |
| `providers/index.ts` | fábrica por `TOLL_PROVIDER_MODE`; **`fake` aborta em produção**; `sandbox`/`production` falham enquanto não houver provedor contratado |
| `providers/simulated.provider.ts` | provedor **simulado**, com aviso no cabeçalho, `provider: "simulated"` e marca `__simulado__` no payload |
| `toll-quote.service.ts` | cobertura por corredor, chave de deduplicação, prazo limitado, validação da resposta, motivos de recálculo, conversão para o público |

### Regras que o código garante, com teste

- **Valor desconhecido nunca vira zero.** `TollAmount` é união; zero legítimo
  (rota sem praça) é distinguível de "não apurado". O resultado público de uma
  falha **não carrega campo `amount`**.
- **Eixos são obrigatórios.** Ausente, zero, negativo ou fracionário recusam a
  cotação. Não há valor padrão presumido.
- **Resposta incompleta não vira valor.** Total ausente → falha. Soma das praças
  divergente do total, quando o provedor afirma detalhamento completo → falha.
  Praça em moeda diferente do total → falha. Detalhamento parcial **não**
  invalida um total correto.
- **Consulta duplicada é reduzida — e o alcance disso precisa ficar claro.**
  Ver a delimitação logo abaixo.
- **Indisponibilidade é classificada**: `unavailable` (fora do ar, timeout),
  `rejected` (recusou), `incomplete`, `unsupported_corridor`, `misconfigured`.
- **Corredor só vale com cobertura conferida.** `CORRIDOR_COVERAGE` começa com
  **nenhum corredor liberado** — nem BR→BR. Simulação não libera corredor.
- **Recálculo** é sinalizado por rota alterada, configuração veicular alterada,
  data de referência alterada, moeda alterada ou cotação vencida.

**30 testes**, rodando na suíte (`npm run test`).

### Delimitação da proteção contra duplicidade

O que está implementado é **cache em memória e mapa de chamadas em voo, dentro
de um processo**. Isso resolve dois casos reais e só esses:

- duplo clique ou reenvio na mesma sessão do servidor;
- repetição da mesma pergunta enquanto a cotação continua válida.

**Não é garantia entre instâncias.** Em produção a aplicação roda em funções
serverless na Vercel, com várias instâncias simultâneas e memória não
compartilhada. Duas requisições atendidas por instâncias diferentes **geram duas
consultas pagas**. O mesmo vale depois de qualquer reinício.

Garantia de verdade exige estado compartilhado, e o lugar natural já existe:
**`route_estimates`**, com unicidade sobre a chave da cotação
(`quoteKey`) enquanto `expires_at` não passou. Enquanto essa unicidade não
existir no banco, **o correto é descrever o que há como redução de custo, não
como idempotência** — e é assim que está escrito no código.

### Achado sobre a suíte

`vitest.config.ts` excluía **todo** `src/server/**`, com a nota de que aquele
caminho usa `node:test`. **Esse caminho não executa:** não há `tsx` nem
`ts-node` no projeto e `node --test` não resolve os imports sem extensão do
TypeScript (`ERR_MODULE_NOT_FOUND`) — conferido também no teste existente de
`driver-verification`, que **nunca rodou**. A exclusão passou a valer só para
`src/server/verification/**`; converter aquele teste é decisão à parte.

---

## 4. Integração ao fluxo — desenho, ainda não ligado

```
rota + configuração veicular
        │
        ▼
  quoteToll()  ──► route_estimates (provider, toll_amount, currency,
        │                            border_crossings, route_payload,
        │                            calculated_at, expires_at)
        ▼
  freight_quotes (toll_amount dentro da decomposição, valid_until)
        │
        ▼
  bids.toll_brl  ──►  contrato
```

### Desenho mínimo, campo a campo

Reaproveitando as tabelas existentes. **Nenhuma tabela nova.**

**(a) Captura da composição e dos eixos**

O pedágio depende do nº de eixos do **conjunto**, que hoje não existe em
produção. Duas opções, em ordem de esforço:

| Opção | O que muda | Quando serve |
|---|---|---|
| **A — `trucks.axle_count`** | uma coluna inteira, anulável, preenchida no cadastro de frota (a tela já pede tipo e capacidade) | conjunto simples; cobre o piloto |
| **B — composição da Fase 1A** | `transport_operation_vehicle_units.axle_count` já existe e soma por `tovc_axle_sum_trg` | cavalo + implementos, múltiplas unidades |

**A opção A é suficiente para o piloto e não depende da Fase 1A.** A B é o
destino, quando a composição entrar em produção. O módulo já aceita as duas: ele
pede `axleCount` e não se importa com a origem.

**(b) Persistência da cotação — `route_estimates`, sem coluna nova**

| Campo existente | O que recebe |
|---|---|
| `provider` | `qualp` \| `ailog` \| `simulated` |
| `provider_route_id` | `idRota` do provedor, para reconsulta e auditoria |
| `toll_amount`, `currency_code` | total e moeda — **só gravado quando `toll.known`** |
| `loaded_distance_km`, `duration_minutes` | da resposta |
| `border_crossings` | travessias, para LATAM |
| `route_payload` | resposta crua + `quoteKey` + eixos usados |
| `calculated_at`, `expires_at` | validade da tarifa |

**Falha não vira linha.** Resposta indisponível ou incompleta **não grava**
`route_estimates` — gravar com `toll_amount` nulo é impossível (coluna
`NOT NULL`), e gravar zero seria exatamente o que o módulo proíbe.

**(c) Ligação à proposta e ao contrato**

```
route_estimates.id ──► freight_quotes.route_estimate_id   (campo já existe)
                            │
                            ├─ freight_quotes.toll_amount
                            └─ freight_quotes.valid_until
                                     │
                                     ▼
                            bids.toll_brl  ──►  contrato
```

Todos os campos existem. O que falta é o escritor.

**(d) Recálculo**

`recalculationReasons()` já decide. A ligação com o fluxo é: ao abrir a
proposta, comparar a pergunta atual com a guardada; havendo motivo, **marcar a
cotação como vencida e exigir nova** antes de enviar.

### O que pode ser feito agora e o que depende do fornecedor

| Pode ser implementado e testado agora | Depende de resposta real do fornecedor |
|---|---|
| `trucks.axle_count` e captura na tela de frota | valor por praça e Free Flow na resposta |
| Unicidade de `quoteKey` em `route_estimates` (duplicidade entre instâncias) | mapeamento dos campos do provedor |
| Escritor de `route_estimates` e `freight_quotes`, com provedor simulado | autenticação e limites |
| Ligação `freight_quotes` → `bids.toll_brl` | validade da tarifa |
| Recálculo ligado à tela de proposta | cobertura de corredor |
| Correção do `anon` em `freight_quotes` | — |

**Não liguei a persistência nesta rodada** porque ela depende de duas decisões
suas — a origem dos eixos (A ou B) e o acesso de escrita, que anda junto com a
correção de permissão da seção 1. Sem elas eu estaria escolhendo por você.

## 5. Validação — o que vale como comprovação

| Etapa | Estado |
|---|---|
| Ambiente descartável, respostas simuladas e identificadas | **feito** — 30 testes; toda resposta marcada `simulated` + `__simulado__` |
| API real em sandbox | **não feito** — depende das credenciais da seção 2 |
| Conferência contra tarifa oficial no corredor do piloto | **não feito** — depende de credencial e das tarifas oficiais |

**Simulação não comprova integração, e o código trata isso como regra, não como
recomendação:** `TOLL_PROVIDER_MODE=fake` aborta a inicialização em produção, e
nenhum corredor fica liberado por simulação.

## 6. Procedimento de publicação

Nenhum passo autorizado; nada aplicado.

1. Contratar o provedor (seção 2) e obter a documentação.
2. Implementar o provedor real em `src/server/toll/providers/`, com as mesmas
   garantias já testadas.
3. Cadastrar as variáveis **apenas no servidor**, nunca com prefixo `VITE_`:
   `TOLL_PROVIDER_MODE=sandbox`, mais as credenciais do provedor escolhido.
4. Rodar contra o sandbox e comparar com **tarifa oficial** no corredor do
   piloto, praça a praça.
5. Só então marcar `verifiedAt` do corredor em `CORRIDOR_COVERAGE`, com a data
   e a nota da conferência. **Um corredor por vez.**
6. Ligar a persistência em `route_estimates` e `freight_quotes`, depois de
   resolver eixos e acesso de escrita.
7. Mudar para `TOLL_PROVIDER_MODE=production`.

## 7. Permissão de `anon` em `freight_quotes`

### Evidência

Colhida em **`fcgsint1001`**, instância sintética local construída **só a partir
das 87 migrations do repositório**, sem dado real.

```
freight_quotes  | rls=t | policies=2 |
  {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
   authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}

route_estimates | rls=t | policies=2 |
  {postgres=arwdDxtm/postgres,
   authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
```

`arwdDxtm` = INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER.

Origem: `20260812140000_latam_capacity_pricing_foundation.sql` cria as duas com
os privilégios padrão do projeto. Depois,
`20260917101200_m3_legacy_security.sql`, linha 102:

```sql
-- capacity_availability / capacity_matches / route_estimates: anon nunca
revoke all on public.capacity_availability, public.capacity_matches,
              public.route_estimates from anon;
```

**`freight_quotes` não está nessa lista.** É a irmã direta das tabelas
revogadas, criada na mesma migration, e ficou de fora de um revoke cujo
comentário declara "anon nunca".

### Alcance real — sem exagero

As duas policies são: `freight_quotes_select` (só SELECT, restrita a dono/membro
da empresa do frete, dono da transportadora ou admin) e
`freight_quotes_admin_manage` (ALL, só admin).

| Operação de `anon` | Efeito |
|---|---|
| SELECT | **bloqueado por RLS** — `auth.uid()` é nulo, nenhuma policy casa, 0 linhas |
| INSERT / UPDATE / DELETE | **bloqueado por RLS** — só a policy de admin permite |
| **TRUNCATE** | **não é coberto por RLS**, só por privilégio — e o privilégio existe |

**Não é vazamento de cotação.** `anon` não lê nada. O que resta é o privilégio
de `TRUNCATE`, que o PostgREST não expõe como operação — então a
explorabilidade pela API REST é baixa. **É gap de endurecimento, não porta
aberta**, e a tabela hoje está vazia.

### Local verificado × remoto não verificado

| | |
|---|---|
| **Verificado** | o estado acima, na instância sintética local |
| **Não verificado** | o estado em produção. Não acessei produção nesta rodada |
| **Inferência, não prova** | as duas migrations estão entre as 84 aplicadas em produção, então o estado remoto **provavelmente** é o mesmo. Isso é dedução a partir do histórico, e só uma leitura do remoto confirma |

### Correção proposta

Uma linha, no mesmo padrão da migration que já existe, em migration nova —
**não editando a migration já aplicada**:

```sql
revoke all on public.freight_quotes from anon;
```

Antes de aplicar: **ler o estado remoto** de `freight_quotes`, para confirmar que
o `anon` está lá e que nada depende dele. Não apliquei nada.

## 8. Pendências externas

1. Assinatura QualP (a partir de R$ 390/mês) ou contrato AILOG.
2. Documentação técnica de qualquer um dos dois.
3. Tarifas oficiais do corredor do piloto, para a conferência.
4. Decisão sobre Vale-Pedágio: se entra no piloto e por qual operadora.
5. Decisão sobre CIOT, que não tem campo algum no modelo.
6. Aplicação da Fase 1A, ou outra origem para a **quantidade de eixos**.
7. Correção do `anon` em `freight_quotes`.
