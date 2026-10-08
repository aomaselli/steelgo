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

> **A migration não vem desta alteração.** Ela vive no PR #4, e este
> procedimento vive no PR #10. Ver **Checkout reproduzível** abaixo. Sem o
> arquivo da migration, o script para e diz isso.

## Checkout reproduzível

O procedimento e a migration estão em alterações separadas, e nenhuma das duas
foi mesclada. Para executar, monte uma árvore que contenha as duas, por SHA —
não por nome de branch, que se move.

| Peça | Origem | SHA |
|---|---|---|
| migration `20261008120000` | PR #4, `fix/driver-link-and-pod` | `364d54336ae2234ee2302f316394a6705dd26b03` |
| procedimento + homologação | PR #10, `chore/procedimento-publicacao` | head do #10 (ver descrição do PR) |

```bash
MIG=364d54336ae2234ee2302f316394a6705dd26b03     # PR #4
PROC=<head do PR #10>                            # git rev-parse origin/chore/procedimento-publicacao

git fetch origin
git checkout --detach "$MIG"                     # árvore com a migration
git checkout "$PROC" -- scripts/banco/publicacao docs/homologacao
```

A ordem importa: o `checkout --detach` fixa a base na migration revisada, e o
segundo comando sobrepõe só os caminhos do procedimento. Nada mais do #10 entra
na árvore.

### Conferir a árvore montada

```bash
git rev-parse HEAD                               # tem de ser o SHA do #4
sed 's/\r$//' supabase/migrations/20261008120000_list_carrier_driver_invitations_rpc.sql \
  | sha256sum                                    # tem de ser 93a99336…
bash scripts/banco/publicacao/testes/publicacao.test.sh
```

A suíte de regressões roda o caso **D1** apenas quando a migration está
presente na árvore — é o sinal de que a montagem deu certo. Sem ela, D1 aparece
como *ignorado*, nunca como aprovado.

Depois, `02-aplicar.sh` recusa qualquer conteúdo cujo sha256 não seja o
revisado, então uma montagem errada não chega ao banco.

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

### `iaabxrclxpsagdijkrcx` — negação permanente

Esse projeto é **proibido inclusive para consulta**. A negação está escrita em
`02-aplicar.sh`, no código, e **não depende de `supabase/config.toml`**: editar,
mover ou apagar aquele arquivo não libera o destino.

- `destino-producao.local` não pode declarar esse ref;
- a URL não pode mencioná-lo.

Além da permanente, nega-se também o que `config.toml` declarar — aquele id não
é produção, seja ele qual for. Essa leitura **soma, nunca substitui**, e a
ausência do arquivo não enfraquece a lista permanente.

> Uma versão anterior derivava a negação **apenas** de `config.toml`: bastava
> trocar uma linha daquele arquivo para o destino proibido deixar de ser negado.
> A seção A de `testes/publicacao.test.sh` existe para impedir que isso volte —
> ela troca e apaga o `project_id` e exige que o proibido continue recusado.

### Por que não se usa `scripts/banco/destino-autorizado.sh`

Aquele validador serve a destinos **descartáveis** e recusa o id de
`config.toml` na barreira 0. Produção é outro destino, com outras barreiras — as
deste diretório.

## Identidade

O ref vem da URL, que é texto de quem chama: não sobrevive a um erro de
digitação. A identidade vem **de dentro do banco**, e tem de ser pinada em
`destino-producao.local` (cópia de `destino-producao.exemplo`, não versionada)
antes de aplicar.

**Identidade insuficiente bloqueia a execução.** Sem identidade pinada, ou se a
pinada não puder ser conferida no destino, o procedimento recusa. Não há caminho
em que a aplicação siga sem identidade lida de dentro do banco.

### O OID do banco não é identidade

`datid` **não é mais aceito**. Medido em 08/10/2026, dois clusters distintos
tinham `datid=5`:

```
simulacao   datid=5   system_identifier=7691806784564547622
ensaio      datid=5   system_identifier=7690680126094364709
```

Uma identidade que coincide entre destinos diferentes confirmaria o destino
errado — o oposto do que ela existe para fazer. O `datid` continua sendo
impresso, rotulado como informativo, e não é lido de volta.

### (A) Preferido: `system_identifier`

Gravado pelo `initdb`; identifica um diretório de dados e não acompanha
recriação de contêiner nem renomeação.

```bash
./02-aplicar.sh --capturar-identidade   # lê e imprime; não altera nada
```

**Origem confiável e vínculo com o projeto.** O valor impresso por esse comando
vem da conexão que você está usando — e é justamente essa conexão que queremos
provar. Por isso ele **não basta sozinho**: leia o mesmo valor por um segundo
caminho que só alcança o projeto autorizado, o **SQL editor do painel do projeto
`lnzgddbnvrbjfvkzbmgf`**:

```sql
select system_identifier from pg_control_system();
```

Aquela sessão é autenticada contra aquele projeto por construção — não há URL
para digitar errado. **Os dois valores iguais é o que vincula a identidade ao
ref.** Só então cole em `destino-producao.local`.

### (B) Alternativa verificável: marcador plantado pelo painel

Use **somente** se o papel de aplicação não puder ler `pg_control_system()` —
o `--capturar-identidade` diz quando é o caso. Não é uma exigência menor, é
outra forma de obter a mesma prova.

No SQL editor **do projeto `lnzgddbnvrbjfvkzbmgf`**, uma única vez:

```sql
create schema if not exists identidade_publicacao;
comment on schema identidade_publicacao is 'lnzgddbnvrbjfvkzbmgf:<um nonce que você gerou>';
```

Depois cole o comentário inteiro em `marcador_identidade`.

**Por que é verificável:** o marcador só pode ter sido criado por quem tem
acesso ao painel daquele projeto, e o nonce é seu. Se a conexão cair noutro
lugar, o schema não existe ou o comentário difere, e o procedimento para. O
script exige ainda que o marcador comece pelo ref declarado — um marcador que
não nomeia o projeto não prova vínculo com ele.

É um objeto novo e vazio, sem dado algum; para remover depois,
`drop schema identidade_publicacao`.

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
  -v marcador_esperado=<marcador do painel ou vazio> \
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

## Regressões

```bash
bash scripts/banco/publicacao/testes/publicacao.test.sh
```

Rodam na CI, no passo *Regressoes do procedimento de publicacao*. **Não
conectam a banco nenhum** e não precisam de rede: cada caso monta uma árvore
temporária com o seu próprio `config.toml` e para nas barreiras de shell,
antes de qualquer `psql`.

**Seção A — negação permanente** (o coração da suíte: mexer em `config.toml`
não pode liberar o proibido):

| Caso | Resultado |
|---|---|
| `config.toml` aponta para produção, destino declara o proibido | recusou |
| `config.toml` trocado por outro id | recusou |
| `config.toml` apagado | recusou |
| `config.toml` declara o próprio proibido | recusou |
| URL cita o proibido, `config.toml` trocado | recusou |
| URL cita o proibido, `config.toml` apagado | recusou |
| o id de `config.toml` também é negado (soma, não substitui) | recusou |

**Seção B — identidade:** sem identidade pinada → recusou; `datid` presente no
arquivo não é mais lido e não supre → recusou; marcador que não nomeia o
projeto → recusou.

**Seção C — demais barreiras:** sem `destino-producao.local`, URL de outro
projeto, URL local, migration ausente, migration adulterada → todas recusaram.

**Seção D — caminho feliz:** com a migration montada na árvore, `--conferir`
passa e não envia nada. Sem ela, D1 é anunciado como *ignorado* — nunca como
aprovado.

Total: **15 casos, 15 aprovados**, D1 ignorado fora do checkout montado.

### A suíte pega o defeito que a motivou

Com a negação permanente removida de `02-aplicar.sh` — isto é, voltando a
derivá-la só de `config.toml` — a suíte reprova:

```
passaram: 10   falharam: 5     (saída 1)
```

Falham A1, A2, A3, A5 e A6. Continuam passando A4 e A7, que são justamente os
casos em que o próprio `config.toml` declara o id negado — a única situação que
a versão antiga cobria.

## Ensaio contra banco

Nenhum passo foi executado em produção. Os passos de SQL foram ensaiados nos
destinos descartáveis, pelo validador.

**Portão de identidade** (destino `ensaio`): sem identidade pinada → bloqueou,
saída 3; `system_identifier` errado → bloqueou, saída 3; `system_identifier`
certo → passou.

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
