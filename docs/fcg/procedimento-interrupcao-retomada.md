# Fase 1A — interrupção e retomada da aplicação das três migrations

Procedimento operacional para o caso em que o lote das três migrations do
Freight Compliance Gate não entra por inteiro.

As migrations são, em ordem:

| | arquivo |
|---|---|
| 1/3 | `20260925120000_fcg_phase1_model.sql` — modelo e fechamento de acesso |
| 2/3 | `20260925120100_fcg_phase1_security.sql` — policies, grants finais, triggers, RPC |
| 3/3 | `20260925120200_fcg_phase1_observational_wiring.sql` — hook observacional e flags |

---

## 1. Cada migration é uma transação própria

Não é suposição. É verificado por teste, em banco sintético descartável, por
`supabase/tests/fcg_migration_atomicity.sql`: uma migration de falha deliberada
é aplicada entre a 1/3 e a 2/3 e o teste confere que

- a 1/3 **permanece** aplicada e registrada em `schema_migrations`;
- a migration que falhou **não** foi registrada;
- ela **não deixou resíduo** — o marcador que cria antes de falhar não existe.

**Consequência: um lote parcialmente aplicado é possível.** Nunca presuma que as
três compartilham uma única transação, e nunca infira o resultado pelo código de
saída de um comando.

## 2. O que cada migration deixa no banco

| | 1/3 | 2/3 | 3/3 |
|---|---|---|---|
| `create table` | **5** | 0 | 0 |
| `add column` | **11** | 0 | 0 |
| `enable row level security` | **5** | 5 (idempotente) | 0 |
| `revoke` | **6** | 8 | 1 |
| `grant` | **0** | **10** | 1 |
| `create policy` | 0 | **4** | 0 |
| `create trigger` | 1 | **12** | 1 |
| `insert into` | 0 | 0 | 1 (as duas flags) |

A 1/3 **só nega**: não há um único `grant` nela. As permissões finais são
concedidas exclusivamente pela 2/3.

## 3. Por que a 1/3 fecha o acesso do que cria

Os privilégios padrão deste projeto concedem `ALL` em `TABLES` e em `FUNCTIONS`
de `public` a `anon` e a `authenticated`, e uma tabela nova nasce com RLS
desabilitada. Isso é conferido a cada execução pela assertiva **P1** de
`supabase/tests/fcg_privilege_closure.sql`, que cria uma tabela e uma função de
controle fora do escopo da Fase 1A só para medir como nascem. Sem essa
conferência, "as tabelas estão fechadas" não provaria nada — poderiam estar
fechadas apenas porque o ambiente não concede.

Se o fechamento ficasse só na 2/3, o estado "1/3 aplicada, 2/3 falhou" deixaria
as cinco tabelas novas com DML completo para papel **anônimo** e sem RLS, por
tempo indeterminado. Por isso ele acontece no fim da própria 1/3: a tabela nasce
fechada, na mesma transação do `create table`.

`TRUNCATE` entra no `revoke` de propósito: **não é coberto por policy de RLS**,
só por privilégio. RLS habilitada sem revogar `TRUNCATE` ainda permitiria
esvaziar a tabela. `REFERENCES` e `TRIGGER` também saem — ambos permitem anexar
objeto próprio a uma tabela de trilha regulatória.

### Sobre a função que a 1/3 cria

`tovc_enforce_axle_sum()` é `security definer` e, pelos privilégios padrão,
nasceria com `EXECUTE` para `PUBLIC`, `anon` e `authenticated`. O `revoke`
retira esse privilégio.

**Precisão, porque a sonda deste caso mediu o contrário do que se poderia
supor:** a chamada direta não estava comprovada como possível. Sendo função de
trigger, o próprio PostgreSQL recusa a invocação direta com `SQLSTATE 0A000` —
*trigger functions can only be called as triggers* — mesmo para quem tenha
`EXECUTE`. O `revoke` não fecha uma porta aberta; retira um privilégio que não
deveria existir e cuja inocuidade depende do **tipo de retorno**. Uma alteração
futura que deixe de retornar `trigger` removeria a proteção do `0A000` sem tocar
no privilégio.

O trigger continua disparando sem esse `EXECUTE`: o privilégio é exigido na
criação do trigger, não a cada disparo. Comprovado por `fcg_behavioral.sql`
A1/A2/A3.

---

## 4. Procedimento

### Antes de aplicar

1. Reverificar `transport_operations` em 0 linhas e as chaves de
   `operational_flags` sem colisão com
   `freight_compliance_gate_enabled` / `_enforcing`.
2. Confirmar que os dumps de recuperação estão preservados em diretório de
   acesso restrito, fora de qualquer árvore de trabalho.
3. **Nomear sempre `--project-ref`.** O `supabase/config.toml` deste
   repositório declara um `project_id` que **não** é o projeto de produção, e a
   prévia (`db push --dry-run`) deixa um vínculo em cache em
   `supabase/.temp/linked-project.json`. Um comando sem destino explícito
   executado a partir desta árvore pode mirar o projeto errado.

### Durante: ler o que de fato aconteceu

Nunca inferir pelo código de saída. Após qualquer desfecho:

```
supabase migration list --project-ref <ref de producao>
```

A coluna remota diz exatamente quais das três entraram.

### Caso A — 1/3 falhou, nada aplicado

Nenhuma coluna nova, nenhuma tabela nova. Causa mais provável: a guarda de
dados legados encontrou operação vinculada a contrato sem `params_fingerprint`.

Retomada: tratar o caso explicitamente — decidir por linha entre manter, migrar
com impressão acordada ou remover por decisão registrada — e só então reaplicar.
**Não remover a guarda.** Nada a conter: o banco está como antes.

### Caso B — 1/3 aplicada, 2/3 falhou

Cinco tabelas novas **com RLS habilitada e sem nenhum privilégio para `anon`,
`authenticated` ou `PUBLIC`**, e sem policy: ilegíveis e inalteráveis por
qualquer papel da aplicação. Onze colunas novas em `transport_operations`, que
já tinha RLS e policy próprias.

**Não há janela de acesso.** Isso é diagnóstico com calma, não urgência.

Retomada:

```
supabase db push --project-ref <ref de producao> --skip-vault
```

O `db push` pula o que já está registrado e aplica a 2/3 e a 3/3. Se a falha foi
transitória, isso conclui a aplicação. Se a 2/3 falhar de novo, diagnosticar pela
mensagem antes de qualquer outra coisa — não há nada a conter.

Reverter a 1/3 é assunto de rodada própria, com script revisado antes de
existir. O efeito do estado intermediário é inércia, não exposição.

### Caso C — 1/3 e 2/3 aplicadas, 3/3 falhou

Modelo e segurança no lugar: RLS habilitada, grants finais concedidos, triggers
append-only ativos. Falta o hook observacional e as duas flags.

**Risco baixo.** O gate fica inerte: nenhum contrato é observado, nenhuma
avaliação é criada.

Retomada: reexecutar `db push` quando conveniente. Se a 3/3 falhar por colisão
de chave em `operational_flags`, a correção é decidir sobre a linha existente,
**não** acrescentar `on conflict`.

### Caso D — as três aplicadas

Conferir: 11 colunas, 5 tabelas, 6 funções, 2 índices únicos parciais, trigger
observacional, guarda presente, **as duas flags em `false`**, 0 rule sets,
0 resultados `compliant`, e o estado final de privilégio:

| tabela | `anon` | `authenticated` | policies |
|---|---|---|---|
| `transport_operation_vehicle_compositions` | — | SELECT | 1 |
| `transport_operation_vehicle_units` | — | SELECT | 1 |
| `regulatory_compliance_results` | — | SELECT | 1 |
| `regulatory_compliance_review_events` | — | — | 0 |
| `fcg_observational_log` | — | — | 0 |

Todas com RLS habilitada.

---

## 5. Como reproduzir as verificações

Em instância **descartável e sintética**, construída apenas a partir das
migrations — sem dump e sem dado real. O executor valida o destino pelo guarda
existente e recusa o projeto protegido; nenhum identificador de container está
escrito nos arquivos, todos vêm por parâmetro.

```powershell
# Com somente a 1/3 aplicada, inclui a prova de atomicidade:
powershell -NoProfile -File .\fcg_run_privilege_closure.ps1 `
  -Container supabase_db_<projeto> -ExpectedProject <projeto> `
  -ExpectedPort <porta> -ExpectedContainerId <64 hexadecimais> `
  -ComprovarAtomicidade -ProjectDirectory <diretorio do projeto descartavel>

# Em qualquer fase, somente o fechamento:
powershell -NoProfile -File .\fcg_run_privilege_closure.ps1 `
  -Container supabase_db_<projeto> -ExpectedProject <projeto> `
  -ExpectedPort <porta> -ExpectedContainerId <64 hexadecimais>
```

`fcg_privilege_closure.sql` detecta a fase em `schema_migrations` e separa o que
é invariante — `anon` nunca tem privilégio, RLS nunca está desligada — do que
depende da fase, que é a leitura concedida a `authenticated` pela 2/3. Por isso
serve antes e depois da 2/3, sem edição.

`-ComprovarAtomicidade` copia `fixtures/fcg_failure_fixture.sql` para o
diretório de migrations do **projeto descartável**, exige que
`supabase migration up` falhe, e remove a injeção em seguida, inclusive se algo
falhar no meio. Antes disso ele confere que o `project_id` declarado no
`config.toml` do diretório é o mesmo projeto já validado e que o diretório
**não** está dentro deste repositório. A fixture nunca entra em
`supabase/migrations/`.

Cada recusa é classificada pelo `SQLSTATE`: só `42501`
(*insufficient_privilege*) conta como aprovação. "Deu erro" não é prova de
acesso fechado — erro de fixture, de constraint ou de sintaxe tem outro código e
reprova a assertiva.

---

## 6. Pendências de produção

Decisões abertas, listadas em `limitacoes-fase-1a.md` e nos registros de
rodada. Nenhuma delas é resolvida por este procedimento.
