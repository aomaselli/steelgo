# Publicação da migration `20261008120000`

Procedimento para aplicar
`supabase/migrations/20261008120000_list_carrier_driver_invitations_rpc.sql`
no projeto Supabase de produção, **antes** do merge do PR #4.

```
sha256 do texto revisado = 93a99336b579447eeafa6456e3bdb9bcb9ea2c8b535362440e7145b454ebaaf2
```

Esse SHA está fixado em `02-aplicar.sh`. Qualquer edição do arquivo muda o SHA e
o script recusa — o que se aplica é exatamente o texto revisado na cabeça
`364d54336ae2234ee2302f316394a6705dd26b03` do PR #4.

> **A migration não vem desta alteração.** Ela vive no PR #4. Rode este
> procedimento a partir de um checkout que a contenha. Sem o arquivo, o script
> para e diz isso.

## O destino de produção

```
ref = lnzgddbnvrbjfvkzbmgf
```

Confirmado em 08/10/2026 por três evidências independentes, **sem conectar a
banco nenhum** e sem imprimir segredo algum:

| # | Evidência | O que diz |
|---|---|---|
| 1 | `supabase/.temp/linked-project.json` | `{"ref":"lnzgddbnvrbjfvkzbmgf","name":"steelgo"}` |
| 2 | bundle público de `https://steelgobr.com.br` | o aplicativo em produção fala com `lnzgddbnvrbjfvkzbmgf.supabase.co` |
| 3 | `docs/fcg/procedimento-interrupcao-retomada.md` | declara que o `project_id` de `supabase/config.toml` **não** é o projeto de produção |

Evidência negativa: o ref de `supabase/config.toml` **não aparece** no bundle de
produção (0 ocorrências; o de produção, 1).

### `supabase/config.toml` não é produção — e é proibido

O `project_id` declarado lá é de outro projeto, **proibido inclusive para
consulta**. Uma versão anterior deste procedimento o tomou por produção e
chegou a exigir que a URL o mencionasse; estaria conduzindo o operador ao
destino errado. Agora ele entra na **lista de negação**, lida do próprio
`config.toml` (se o arquivo mudar, a negação acompanha):

- `destino-producao.local` não pode declarar esse ref;
- a URL não pode mencioná-lo.

### Por que não se usa `scripts/banco/destino-autorizado.sh`

Aquele validador serve a destinos **descartáveis** e recusa o id de
`config.toml` na barreira 0. Produção é outro destino, com outras barreiras — as
deste diretório.

## Identidade insuficiente bloqueia a execução

O ref vem da URL, que é texto de quem chama: não sobrevive a um erro de
digitação. A identidade vem **de dentro do banco**.

Antes de aplicar, preencha `destino-producao.local` (cópia de
`destino-producao.exemplo`, não versionada) com ao menos um de:

- `system_identifier` — gravado pelo `initdb`, identifica um diretório de dados;
- `datid` — OID do banco, legível por qualquer papel.

```bash
./02-aplicar.sh --capturar-identidade   # lê e imprime; não altera nada
```

Confira o que aparecer **no painel do Supabase**, contra o projeto
`lnzgddbnvrbjfvkzbmgf`, e só então cole no arquivo.

Sem identidade pinada, ou se a pinada não puder ser conferida no destino, o
procedimento **recusa**. Não há caminho em que a aplicação siga sem identidade
lida de dentro do banco.

## Ordem

```
destino → identidade → 01 → 02 --conferir → 02 --aplicar → 03 → merge do #4
```

**Migration primeiro, aplicação depois.** O merge do #4 dispara o deploy da
Vercel; nenhum workflow aplica migration. Na ordem inversa haveria uma janela em
que a aba de convites mostraria "Não foi possível carregar os convites".

A ordem é segura porque a migration **não muda nada que a aplicação atual use**:
só acrescenta uma função. Com ela aplicada e o aplicativo antigo no ar, a aba
continua exatamente como está hoje — conferido, `has_table_privilege` de `anon` e
`authenticated` sobre `driver_carrier_invitations` continua `false` depois de
aplicar.

## Execução

```bash
export SUPABASE_DB_URL='postgresql://...'   # conexão de produção
cd scripts/banco/publicacao
cp destino-producao.exemplo destino-producao.local   # e preencha a identidade
```

### 1. Pré-condições (só leitura)

Rodadas automaticamente por `02-aplicar.sh --aplicar`. Para rodar à parte:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -v ref_esperado=lnzgddbnvrbjfvkzbmgf \
  -v identidade_esperada=<system_identifier ou vazio> \
  -v datid_esperado=<datid ou vazio> \
  -f 01-precondicoes.sql
```

Confere identidade; se a migration já foi aplicada; dependências
(`driver_carrier_invitations`, `is_current_user_company_owner`,
`is_current_user_company_member`, `auth.uid`); e a premissa de segurança — a
tabela tem de continuar **sem** `SELECT` para `anon` e `authenticated`. Se
estiver legível, a premissa da migration mudou e o procedimento para.

**Porta:** saída `0` e a linha `PRE-CONDICOES OK`.

### 2. Aplicação

```bash
./02-aplicar.sh --conferir    # gera e mostra, não envia nada
./02-aplicar.sh --aplicar     # roda 01 e, se passar, aplica
```

Uma transação só (`--single-transaction` + `ON_ERROR_STOP=1`) contendo o DDL
**e** o registro em `supabase_migrations.schema_migrations`. Não existe estado em
que a função exista sem registro.

O texto aplicado e o registrado são o mesmo: o arquivo é lido uma vez,
normalizado só no fim de linha, e guardado inteiro na coluna `statements`. O
`sha256` vai no `name`, então o histórico prova o que rodou.

> **Não use `supabase db push`.** Ele aplica *todas* as migrations que o
> histórico remoto não tiver — são 88 na árvore e o histórico remoto não foi
> conferido. Se preferir a CLI, rode antes
> `supabase db push --dry-run --project-ref lnzgddbnvrbjfvkzbmgf` e **exija que
> a lista tenha exatamente um arquivo**, o `20261008120000`. Nomeie sempre
> `--project-ref`: `supabase/.temp/linked-project.json` deixa um vínculo em
> cache, e um comando sem destino explícito pode mirar o projeto errado.

### 3. Verificação

```bash
psql "$SUPABASE_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -f 03-verificar.sql
```

Sete conferências: função única / `security definer` / `search_path` vazio /
`stable`; as nove colunas de retorno (nenhum token, nenhum hash); ACL (`anon` sem
`EXECUTE`, nada para `PUBLIC`); isolamento (a tabela continua ilegível direto);
histórico; recusa efetiva a `anon` (42501); recusa a chamador sem sujeito
(42501).

As duas últimas **executam de verdade**, dentro da transação que termina em
rollback. Nada é escrito.

**Porta:** saída `0` e `todas as conferencias passaram`. Qualquer `FALHOU`
levanta exceção e o passo sai diferente de zero — **não publique a aplicação**.

### 4. Merge do #4

Só depois do passo 3 aprovado.

## 5. Recuperação

### A aplicação falhou no meio

Não há o que reverter: tudo roda em uma transação. Rode `01` de novo para
confirmar e reaplique.

### Aplicou, mas a verificação reprovou

```bash
psql "$SUPABASE_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -f 04-reverter.sql
```

**Nenhum dado é perdido.** A migration é aditiva: cria uma função, comenta,
ajusta a ACL dela mesma e confere invariantes. Não escreve, altera nem apaga
linha alguma; não cria nem altera tabela, coluna, índice, policy ou tipo; não
mexe em privilégio de objeto preexistente. Retirar a função devolve o banco ao
estado anterior — o máximo que se perde é a listagem de convites na tela, que
volta ao 403 conhecido.

Se o #4 já estiver publicado, **reverta a aplicação antes do banco**.

### Função aplicada sem registro no histórico

Estado que o passo `01` recusa com *"funcao existe mas o historico nao a
registra"*. Acontece quando alguém aplica o arquivo por `psql` e ninguém escreve
o histórico. Conserto, sem tocar na função: aplique só o `insert` que
`./02-aplicar.sh --conferir` imprime, em transação, e rode `03`.

### Registro sem função

O inverso, também recusado por `01`. Apague a linha
(`delete from supabase_migrations.schema_migrations where version='20261008120000'`)
e refaça a partir de `01`.

## Ensaio executado

Nenhum passo foi executado em produção. O procedimento foi ensaiado nos destinos
descartáveis, pelo validador, e as barreiras de shell com valores forjados.

**Portão de identidade** (destino `ensaio`):

| Caso | Resultado |
|---|---|
| sem identidade pinada | bloqueou, saída 3 |
| `system_identifier` errado | bloqueou, saída 3 |
| `datid` errado | bloqueou, saída 3 |
| ambos certos | passou, "2 sinais" |
| só `datid`, certo | passou, "1 sinal" |

**Barreiras de `02-aplicar.sh`** (nenhum caso conecta):

| Caso | Resultado |
|---|---|
| sem `destino-producao.local` | recusou |
| `ref` = `project_id` de `config.toml` | recusou |
| sem identidade pinada | recusou |
| URL cita o projeto proibido | recusou |
| URL de outro projeto | recusou |
| URL local | recusou |
| migration adulterada (SHA diverge) | recusou |
| tudo certo, `--conferir` | passou, nada enviado |

**Ciclo completo** no destino `ensaio`: `01` passou → aplicação `INSERT 0 1` em
uma transação → `03` com 7/7 → `04` revertida (`DROP FUNCTION`, `DELETE 1`) →
`01` de novo, limpo.

Dois defeitos foram encontrados **pelo próprio ensaio** e corrigidos:

1. `03` reprovava uma migration correta: `set search_path = ''` é guardado como
   `search_path=""`, com aspas, e a comparação esperava `search_path=`. Saiu com
   código 3 e barrou a publicação — o portão fez o que devia.
2. `01` quebrava com `syntax error at or near ":"`: o psql **não** interpola
   variáveis dentro de blocos `$$`. Os valores passaram a entrar por tabela
   temporária, lida pelo bloco.
