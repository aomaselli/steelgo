# Pedágio: composição veicular, eixos e proteção contra consulta duplicada

**Escopo.** Recomendação técnica revisada, **sem alteração de esquema**. Nenhuma
coluna `axle_count` foi criada. O serviço em `src/server/toll/` já **recusa**
cotar sem quantidade de eixos válida — a ausência do dado é tratada como falha,
nunca como zero.

Esquema verificado no banco descartável da simulação (`supabase_db_fcgsint1001`),
que carrega as mesmas migrations do repositório. **Produção não foi acessada.**

> **Revisão.** Uma versão anterior desta nota propunha derivar os eixos de uma
> tabela de referência por `truck_type`. **Referência por tipo não basta** — ver
> §3. E propunha um índice único parcial com `where expires_at > now()`, que o
> PostgreSQL **recusa**: `functions in index predicate must be marked IMMUTABLE`
> (erro reproduzido). Ver §5.

---

## 1. O que o modelo já diz sobre composição

`public.trucks` tem 22 colunas. As relevantes:

| coluna | tipo | o que representa |
|---|---|---|
| `type` | enum `truck_type` | `truck_simples`, `toco`, `truck`, `bitruck`, `carreta`, `carreta_extendida`, `rodotrem`, `bitrem`, `ev_carreta`, `ev_truck` |
| `body_type` | text | carroceria |
| `payload_tons`, `max_weight_tons`, `capacity_tons` | numeric | capacidade |
| `registration_number`, `crlv_url` | text | vínculo com o documento oficial |
| `regulatory_attributes` | jsonb | campo existente para atributos regulatórios |

O enum já declara a **classe** de composição. Não declara a composição em
operação: `rodotrem` e `bitrem` são combinações cujo implemento é trocável.

## 2. Por que `axle_count` em `trucks` seria o lugar errado

1. **O eixo não é do cavalo, é da combinação em uso.** O implemento muda sem que
   a linha de `trucks` mude. Uma coluna fixa estaria errada exatamente nos casos
   que mais pesam na tarifa.
2. **O implemento não está modelado.** Não há tabela de semirreboques.
3. **Eixo suspenso é evento, não cadastro.** Não é tarifado quando suspenso, e
   isso varia a cada passagem. Já está no lugar certo:
   `VehicleConfiguration.raisedAxles`, no **pedido** de cotação.
4. **Coluna nova nasce nula para a frota inteira.**

## 3. O ponto que a revisão corrige: referência por tipo não basta

A versão anterior propunha `vehicle_axle_profiles(truck_type, country_code,
axle_count, …)` como fonte do número de eixos. **Isso é insuficiente, e perigoso
pelo mesmo motivo que a coluna fixa:** `carreta` pode rodar com 5, 6 ou 7 eixos;
`rodotrem` varia conforme o conjunto. Um padrão por tipo produz número plausível
e errado — e o pedágio é cobrado sobre o número real que passou na praça.

**A quantidade de eixos usada numa cotação tem de ser a configuração efetiva
daquela viagem, confirmada por alguém, com registro de quem confirmou e quando.**

### 3.1 Onde a confirmação vive

A viagem já tem designação de motorista e veículo (`trip_assignments`). A
configuração efetiva pertence a esse mesmo momento — é parte de "quem vai levar
com o quê":

```
trip_vehicle_configurations(
  trip_id            uuid,
  axle_count         smallint not null,     -- eixos da combinação em operação
  implement_plate    text,                  -- placa do implemento, quando houver
  source             text not null,         -- 'crlv' | 'motorista' | 'transportadora'
  confirmed_by       uuid not null,         -- quem confirmou
  confirmed_at       timestamptz not null,
  superseded_at      timestamptz            -- nova confirmação substitui a anterior
)
```

Isto **não duplica** `trucks`: `trucks` descreve o veículo cadastrado; esta
tabela descreve a combinação que de fato saiu para a viagem.

### 3.2 O papel que sobra para a referência por tipo

Apenas **sugerir o valor inicial do campo**, na tela de designação, para reduzir
digitação. Nunca ser aceita sozinha:

- a tela mostra o sugerido e **exige confirmação explícita**;
- sem confirmação, não há configuração efetiva e a cotação é **recusada**;
- a origem do valor fica registrada em `source` — eixo informado pelo motorista
  e eixo lido do CRLV não têm o mesmo peso em disputa.

### 3.3 Resolução no momento da cotação

```
eixos = configuração efetiva confirmada e vigente para esta viagem
      ?? RECUSA ("quantidade de eixos ausente ou inválida")
```

Sem segundo nível. A recusa já está implementada e testada.

### 3.4 Reconfirmação

Trocar veículo, trocar implemento ou reatribuir a viagem **invalida** a
confirmação anterior (`superseded_at`) e exige nova. A cotação guardada também
cai: `recalculationReasons` já devolve `configuracao_veicular_alterada`.

### 3.5 Quando promover a coluna em `trucks`

Só quando existir leitura automática de fonte oficial (CRLV/ANTT) por veículo
**e** a combinação for estável o bastante para que o cadastro valha mais que a
confirmação por viagem. Antes disso, coluna é aposta.

---

## 4. O que existe hoje contra duplicidade, e o que não garante

`InMemoryTollQuoteCache` e o mapa `inFlight` em `quoteToll` evitam duas chamadas
para a mesma pergunta **dentro de uma instância**. **Não é garantia entre várias
instâncias**: dois processos, ou duas regiões, chamam o provedor duas vezes e
pagam duas vezes. É redução de custo, não idempotência.

## 5. Reserva com unicidade — desenho revisado

### 5.1 O erro da versão anterior

Propunha:

```sql
create unique index route_estimates_quote_key_uidx
  on public.route_estimates (quote_key)
  where expires_at > now();          -- NÃO FUNCIONA
```

O PostgreSQL recusa: predicado de índice precisa ser imutável, e `now()` é
estável. Reproduzido no banco descartável:
`ERROR: functions in index predicate must be marked IMMUTABLE`.

### 5.2 Desenho correto: uma linha por chave, renovada

Índice único **total**, sem predicado — a linha é o slot único daquela pergunta:

```sql
create unique index route_estimates_quote_key_uidx
  on public.route_estimates (quote_key);
```

A reserva vira um `INSERT … ON CONFLICT DO UPDATE` **condicional**. Só quem
consegue atualizar a linha ganha o direito de chamar o provedor:

```sql
insert into public.route_estimates (quote_key, status, reserved_at, attempt, …)
values ($1, 'pending', now(), 1, …)
on conflict (quote_key) do update
   set status      = 'pending',
       reserved_at = now(),
       attempt     = route_estimates.attempt + 1
 where route_estimates.expires_at   <  now()                              -- cotação venceu
    or (route_estimates.status = 'pending'
        and route_estimates.reserved_at < now() - interval '2 minutes')   -- reserva abandonada
returning id;
```

- **Voltou linha:** este processo ganhou a corrida e **só ele** chama o provedor.
- **Não voltou linha:** ou há cotação válida (lê e usa), ou outro processo está
  consultando agora (espera ou devolve "cotação em andamento"). Nunca dispara
  uma segunda chamada paga.

O `ON CONFLICT DO UPDATE` trava a linha, então chamadas concorrentes serializam
no banco, não no processo. O `where` do `DO UPDATE` é avaliado em tempo de
execução — e aí `now()` é perfeitamente válido; o que não se podia era usá-lo no
**predicado do índice**.

### 5.3 Pontos de atenção do desenho

1. **Transação curta.** Reserva e chamada externa em transações separadas. Nunca
   manter transação aberta durante I/O externo.
2. **Reserva abandonada é retomada por tempo**, com `attempt` limitado: falha
   persistente vira erro registrado, não laço infinito.
3. **A chave precisa carregar a configuração confirmada**, não só o número de
   eixos: incluir o id da configuração efetiva em `quoteKey`, para que toda
   cotação seja rastreável até a confirmação que a justificou. Sem isso, duas
   confirmações diferentes com o mesmo número de eixos colapsam na mesma chave e
   a auditoria perde o rastro.
4. **Idempotência no provedor**, se houver: enviar o `quote_key`, fechando a
   janela entre reserva gravada e requisição enviada.
5. **O mapa em memória continua** como primeiro filtro barato dentro da
   instância — apresentado pelo que é.
6. **Colunas novas em `route_estimates`** (`quote_key`, `status`, `reserved_at`,
   `attempt`) **exigem migration**. Não foram criadas.

### 5.4 Por que não `pg_advisory_lock`

Serializaria igual, sem escrever linha. Mas o lock de transação exigiria manter
a transação aberta durante a chamada externa, e o lock de sessão exige liberação
explícita, que não acontece se o processo morrer. A reserva tem estado visível,
auditável e retomada por tempo.

---

## 6. O que esta nota não cobre

- Nenhum corredor tem cobertura verificada: `CORRIDOR_COVERAGE` está com
  `verified_at: null`. Nenhuma cotação é liberada hoje, por desenho.
- Nenhuma tabela, coluna ou índice foi criado. Isto é recomendação; a migration
  depende de decisão sua.
- Nada aqui foi verificado contra o ambiente remoto.
