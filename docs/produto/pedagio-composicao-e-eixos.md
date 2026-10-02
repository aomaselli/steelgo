# Pedágio: composição veicular, eixos e proteção contra consulta duplicada

**Escopo desta nota.** Recomendação técnica, sem alteração de esquema. Nenhuma
coluna `axle_count` foi acrescentada. O que existe hoje em código é o serviço
de cotação em `src/server/toll/`, que **recusa** cotar sem quantidade de eixos
válida (`quoteToll`, guarda no início) — ou seja, a ausência do dado já é
tratada como falha, não como zero.

Evidência de esquema verificada no banco descartável da simulação
(`supabase_db_fcgsint1001`), que carrega as mesmas migrations do repositório.
**Não** foi consultado o ambiente remoto.

---

## 1. O que o modelo já diz sobre composição

`public.trucks` tem 22 colunas. As relevantes:

| coluna | tipo | o que já representa |
|---|---|---|
| `type` | enum `truck_type` | a composição: `truck_simples`, `toco`, `truck`, `bitruck`, `carreta`, `carreta_extendida`, `rodotrem`, `bitrem`, `ev_carreta`, `ev_truck` |
| `body_type` | text | carroceria |
| `payload_tons`, `max_weight_tons`, `capacity_tons` | numeric | capacidade |
| `registration_number`, `crlv_url` | text | vínculo com o documento oficial |
| `regulatory_attributes` | jsonb | campo já existente para atributos regulatórios |

O enum `truck_type` **já é**, na prática, a declaração de composição. `rodotrem`
e `bitrem` não são "tipos de caminhão": são combinações de veículos com número
de eixos característico. Acrescentar `axle_count` como coluna livre ao lado
desse enum cria **duas fontes para o mesmo fato**, que passam a poder discordar
— e, quando discordarem, nada no sistema diz qual vale.

## 2. Por que `axle_count` em `trucks` seria o lugar errado

1. **O eixo não é do cavalo, é da combinação.** Em `carreta`, `bitrem` e
   `rodotrem` o implemento é trocável. Uma linha em `trucks` descreve o veículo
   cadastrado; a quantidade de eixos muda quando o implemento muda, sem que a
   linha mude. Uma coluna fixa estaria errada exatamente nos casos que mais
   pesam na tarifa.
2. **O implemento não está modelado.** Não há tabela de semirreboques. Enquanto
   não houver, `axle_count` em `trucks` seria uma média disfarçada de fato.
3. **Eixo suspenso é evento, não cadastro.** No Brasil, eixo suspenso não é
   tarifado. Isso varia a cada passagem, por decisão do motorista. Já está no
   lugar certo: `VehicleConfiguration.raisedAxles`, no **pedido** de cotação
   (`src/server/toll/types.ts`), não no veículo.
4. **Coluna nova nasce nula para a frota inteira.** Uma coluna obrigatória
   quebra o cadastro existente; uma opcional vira `null` em 100% das linhas e
   não resolve nada até alguém preencher — e aí voltamos a precisar de um
   padrão por composição.

## 3. Recomendação, em três camadas

### 3.1 Tabela de referência por composição (dado de referência, não estado)

```
vehicle_axle_profiles(
  truck_type      truck_type,
  country_code    text,
  axle_count      smallint,      -- padrão da composição naquele país
  source          text,          -- norma/tabela tarifária que embasa
  verified_at     timestamptz,   -- nulo = não conferido, não pode liberar cotação
  primary key (truck_type, country_code)
)
```

É **dado de referência com procedência**, no mesmo espírito de
`CORRIDOR_COVERAGE`: um perfil sem `verified_at` não libera cotação, recusa.
Não duplica estado de veículo nenhum — descreve a composição, não o caminhão.

### 3.2 Exceção medida vai para o jsonb que já existe

Quando a combinação real diverge do padrão, a exceção entra em
`trucks.regulatory_attributes`, com chave documentada e procedência:

```json
{ "axles": { "count": 7, "source": "crlv", "verified_at": "2026-10-02T12:00:00Z" } }
```

Uma exceção opcional em campo existente, em vez de uma coluna nova nula para
toda a frota. E com `source`: eixo informado pelo motorista e eixo lido do CRLV
não têm o mesmo peso.

### 3.3 Resolução no momento da cotação, com recusa explícita

```
eixos = exceção em regulatory_attributes.axles
      ?? perfil verificado (truck_type, country_code)
      ?? RECUSA  ("quantidade de eixos ausente ou inválida")
```

A recusa já está implementada e testada. Nada de supor 5 eixos: supor produz
número errado com aparência de certo, que é o modo de falha que esta integração
inteira foi desenhada para evitar.

### 3.4 Quando promover a coluna

Só com os dois gatilhos juntos: (a) existir fonte oficial por veículo
(CRLV/ANTT) efetivamente lida pelo sistema, e (b) a exceção estar em uso em
parcela relevante da frota. Antes disso, coluna é aposta.

---

## 4. Impedir consulta concorrente duplicada antes da chamada externa

### 4.1 O que existe hoje, e o que ele não garante

`InMemoryTollQuoteCache` + o mapa `inFlight` em `quoteToll` evitam que **a mesma
instância** faça duas chamadas para a mesma pergunta. **Não é garantia entre
várias instâncias**: dois processos do servidor, ou duas regiões, chamam o
provedor duas vezes e pagam duas vezes. É redução de custo, não idempotência.

### 4.2 Proposta: reserva com unicidade no banco

`route_estimates` já guarda `toll_amount`, `currency_code`, `provider`,
`provider_route_id`, `route_payload`, `expires_at`. Faltam a chave e a reserva:

1. **Chave canônica persistida.** `quote_key text` — o mesmo `quoteKey(request)`
   já implementado (coordenadas a 5 casas, eixos, tipo, eixos suspensos, data,
   moeda). Índice único parcial sobre as cotações vigentes:
   ```sql
   create unique index route_estimates_quote_key_uidx
     on public.route_estimates (quote_key)
     where expires_at > now();
   ```
2. **Reserva antes da chamada.** Quem vai consultar o provedor insere primeiro
   uma linha `status = 'pending'`:
   ```sql
   insert into public.route_estimates (quote_key, status, ...)
   values ($1, 'pending', ...)
   on conflict (quote_key) where expires_at > now() do nothing
   returning id;
   ```
   - Voltou linha: este processo ganhou a corrida e **só ele** chama o provedor.
   - Não voltou linha: outro já está consultando. Este lê a linha existente e
     espera o resultado (ou devolve "cotação em andamento") — nunca dispara uma
     segunda chamada paga.
3. **Transação curta.** A inserção da reserva e a chamada externa ficam em
   transações separadas. A chamada pode levar segundos; manter transação aberta
   durante I/O externo prende conexão e multiplica deadlock.
4. **Reserva vencida pode ser retomada.** Processo que morre não pode travar a
   chave para sempre:
   ```sql
   update public.route_estimates
      set status = 'pending', attempt = attempt + 1, updated_at = now()
    where quote_key = $1 and status = 'pending'
      and updated_at < now() - interval '2 minutes'   -- timeout do provedor + folga
   returning id;
   ```
   `attempt` limitado, para que falha persistente vire erro e não laço infinito.
5. **Idempotência no provedor.** Se o provedor aceitar chave de idempotência,
   enviar o `quote_key`: fecha a janela entre "reserva gravada" e "requisição
   efetivamente enviada".
6. **O mapa em memória continua** — como primeiro filtro barato dentro da
   instância. Ele deixa de ser apresentado como garantia e passa a ser o que é:
   economia local.

### 4.3 Por que não `pg_advisory_lock`

Serializaria igual, sem escrever linha. Mas o lock de transação exige manter a
transação aberta durante a chamada externa (item 3 acima), e o lock de sessão
exige liberação explícita — que não acontece se o processo morrer. A reserva com
unicidade tem o estado visível, auditável e com retomada por tempo.

---

## 5. O que esta nota não cobre

- Não há corredor com cobertura verificada: `CORRIDOR_COVERAGE` está com
  `verified_at: null`. Nenhuma cotação é liberada hoje, por desenho.
- Tabela de perfis e colunas de reserva **não foram criadas**. Isto é
  recomendação; a migration depende de decisão sua.
- Nada aqui foi verificado contra o ambiente remoto.
