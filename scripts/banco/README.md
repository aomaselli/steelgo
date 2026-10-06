# Validador de destino de banco

`destino-autorizado.sh` é o **único** caminho previsto para rodar SQL numa pilha
Supabase local a partir deste repositório.

## Restrições de uso — leia antes

1. **Só SQL revisado.** O que entra aqui é SQL que alguém leu antes: uma
   migration do repositório, um teste versionado, uma consulta escrita e
   conferida para a ocasião. Este script não é um console interativo nem um
   atalho para colar comando improvisado em banco.
2. **Só destinos explicitamente autorizados.** Os destinos vivem em
   `destinos.local`, escrito à mão, que **não é versionado**. Sem esse arquivo o
   script não alcança nada. Não existe descoberta automática, não existe varredura
   de contêineres, não existe destino padrão.
3. **Nunca a instância do projeto principal.** O script lê o `project_id` de
   `supabase/config.toml` e recusa esse id antes de qualquer outra conferência —
   inclusive se alguém o escrever em `destinos.local` por engano.
4. **Nada de produção.** Ele fala com contêiner local, por `docker exec`. Não há
   caminho aqui para banco remoto, e tentar abrir um é recusado.

## Por que ele existe

Em 05/10/2026, durante um levantamento, dois laços sobre
`docker ps | grep "^supabase_db_"` alcançaram a pilha local do projeto principal
com quatro SELECTs de contagem. Nenhuma escrita, mas acesso que não deveria ter
havido. A causa foi **varrer** em vez de **nomear** o destino. Este script existe
para que varrer deixe de ser possível.

## As seis conferências

Antes de rodar qualquer coisa, o apelido tem de corresponder à instância
esperada em seis pontos. As cinco primeiras são metadados do Docker e **não
abrem conexão com banco nenhum**; só depois de todas passarem a sexta conecta,
para uma única consulta de identidade.

| # | conferência | natureza |
|---|---|---|
| 0 | id protegido recusado antes de tudo | `project_id` de `supabase/config.toml` |
| 1 | **ID completo do contêiner** (64 hex) | atribuído pelo Docker |
| 2 | rótulo `com.supabase.cli.project` | declaração |
| 3 | rótulo `com.supabase.cli.workdir` | declaração |
| 4 | **porta publicada do PostgreSQL** (`5432/tcp`) | mapeamento real |
| 5 | porta publicada do kong (`8000/tcp`) | mapeamento real |
| 6 | **`system_identifier` do cluster** | gravado pelo `initdb` no diretório de dados |

Rótulo e nome de contêiner são texto que quem cria o contêiner escolhe:
`docker run --label` reproduz qualquer um. O ID completo identifica **um**
contêiner; o `system_identifier` identifica **um** diretório de dados e não
acompanha um relabel nem uma recriação. Os rótulos dizem "alguém disse que é";
esses dois dizem "é".

Contêiner recriado muda de ID — e aí o script **recusa** e pede atualização
manual da lista. Reconhecer o substituto sozinho seria voltar a confiar no nome.

## A conexão não se negocia por linha de comando

Os argumentos de quem chama passam por **lista de permissão**:

* recusados: `-h --host -p --port -U --username -d --dbname -w -W --password
  -l --list --service`, URI de conexão, `-f`, `-v/--set`, e qualquer opção que
  não esteja na lista;
* permitidos: `-c/--command`, `--sql-arquivo`, `-1`, `-t`, `-A`, `-X`, `-x`,
  `-q`, `-e`, `-E`, `--csv`, `-F`, `-R`, `-P`, `--permitir-parada-desligada`.

A conexão (`-h` socket local, `-p 5432`, `-U postgres`, `-d postgres`, `-X`,
`-v ON_ERROR_STOP=1`, `-w`) é montada pelo script e aplicada **depois** dos
argumentos de quem chama: no psql, a última ocorrência de uma opção é a que
vale. O `docker exec` usa o **ID completo já validado**, não o nome — entre a
conferência e a execução um nome pode mudar de dono, um ID de 64 hex não.

O SQL também é inspecionado, porque metacomando do psql é a mesma fuga por outro
caminho. São recusados `\connect`, `\!`, canos para shell (`\o |`, `\g |`,
`\copy |`), inclusão de arquivo (`\i`, `\ir`, `\include`, `\include_relative`) e
qualquer `\set`/`\unset` de `AUTOCOMMIT`. `\set ON_ERROR_STOP on` continua
aceito: é o que as migrations escrevem e diz a mesma coisa que o script já impõe.

### `--permitir-parada-desligada`

As oito baterias de diagnóstico de `supabase/tests/` começam com
`\set ON_ERROR_STOP off` **de propósito**: elas querem rodar todas as
verificações e relatar, em vez de parar na primeira. Barrar isso seria recusar
trabalho legítimo.

A regra, então, não é "ninguém desliga a parada", e sim **quem decide**:

* o **SQL** nunca decide — `\set ON_ERROR_STOP off` dentro do payload é recusado;
* o **operador** decide, na linha de comando, com `--permitir-parada-desligada`,
  que aparece no comando, sai no log e vem com aviso em destaque.

A permissão **não se combina com `-1`**. Uma é para bateria que segue após erro;
a outra é para aplicação atômica, que tem de parar no primeiro. Juntas seriam o
pior dos dois mundos. Aplicação de migration usa `-1` e nunca esta permissão.

## Uso

```bash
cp scripts/banco/destinos.exemplo scripts/banco/destinos.local   # e preencha
scripts/banco/destino-autorizado.sh --listar
scripts/banco/destino-autorizado.sh --conferir <apelido>         # só as barreiras
scripts/banco/destino-autorizado.sh <apelido> -c "select 1;"
scripts/banco/destino-autorizado.sh <apelido> --sql-arquivo supabase/migrations/<x>.sql -1
```

`--sql-arquivo` lê o arquivo **no host**, inspeciona e manda pela entrada padrão;
o script acrescenta `-f -`, que é o que põe `--single-transaction` dentro do
contrato documentado do psql e faz o erro trazer a linha
(`psql:<stdin>:130: ERROR …`).

## Testes

```bash
bash scripts/banco/testes/validador.test.sh
```

Rodam com `docker` e `psql` **simulados**: nenhum contêiner é tocado, nenhuma
conexão de banco é aberta, e a lista de destinos usada é sintética, criada num
diretório temporário. Cada caso altera um atributo por vez, para que a recusa
observada só possa ser atribuída à barreira em teste; cada recusa também confere
que **nenhum comando chegou a ser executado** no contêiner.

A seção H passa o SQL **de verdade** deste repositório pela inspeção: uma lista
de permissão que recusa o trabalho legítimo é tão inútil quanto uma que aceita
tudo.
