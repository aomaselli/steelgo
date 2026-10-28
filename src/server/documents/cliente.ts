/**
 * Visão tipada das tabelas de documentos de validação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * `src/integrations/supabase/types.ts` é gerado a partir do projeto remoto, e
 * o projeto remoto **não tem** a migration da Etapa 1 — ela nunca foi aplicada
 * lá, e aplicá-la não está autorizado. Gerar os tipos de novo exigiria acesso
 * à instância que está proibida.
 *
 * Então as cinco tabelas do #13 e a função de registro simplesmente não
 * existem para o compilador. As saídas possíveis eram:
 *
 *   1. `as any` em cada chamada — o compilador para de reclamar e para de
 *      ajudar, inclusive onde o nome da coluna estiver errado;
 *   2. editar o arquivo gerado — que diz, na primeira linha, para não ser
 *      editado, e que a próxima geração desfaz;
 *   3. descrever aqui, por conta própria, só o que este módulo usa.
 *
 * Esta é a terceira. O tipo é estreito de propósito: descreve as colunas que o
 * fluxo lê e escreve, e nada além. Quando a migration chegar a um projeto do
 * qual se possa gerar tipos, este arquivo sai inteiro — e a remoção é
 * mecânica, porque não há lógica aqui.
 *
 * NÃO É uma segunda fonte de verdade sobre o esquema: a fonte é a migration, e
 * a bateria SQL é quem confere. Isto é um adaptador de tipos.
 */

export type TabelaDeDocumentos =
  | "document_consent_texts"
  | "document_consents"
  | "validation_documents"
  | "document_review_events"
  // Esta existe nos tipos gerados. Entra aqui só para que a resolução de
  // papel passe pelo mesmo cliente das outras consultas, em vez de o módulo
  // carregar duas formas do mesmo objeto.
  | "user_roles";

export interface ErroDeConsulta {
  message: string;
  /**
   * SQLSTATE devolvido pelo PostgREST, quando houver.
   *
   * É o que distingue recusa de barreira (`DV0…`, deterministicamente
   * repetível) de falha sem resposta. Sem ele, desfazer e repetir ficariam
   * indistinguíveis — e errar nessa escolha apaga envio que deu certo ou
   * duplica o que não deu.
   */
  code?: string;
}

export interface Resposta<T> {
  data: T[] | null;
  error: ErroDeConsulta | null;
}

/**
 * Encadeamento do PostgREST, reduzido ao que o fluxo usa.
 *
 * `PromiseLike` em vez de `Promise` porque o construtor de consulta do
 * supabase-js é "thenable": ele só dispara quando alguém espera por ele.
 */
export interface Consulta<T> extends PromiseLike<Resposta<T>> {
  select(colunas: string): Consulta<T>;
  eq(coluna: string, valor: string): Consulta<T>;
  is(coluna: string, valor: null): Consulta<T>;
  order(coluna: string, opcoes: { ascending: boolean }): Consulta<T>;
  limit(n: number): Consulta<T>;
}

export interface Insercao {
  insert(linha: Record<string, unknown>): PromiseLike<{ error: ErroDeConsulta | null }>;
}

/** As funções definidoras que este módulo chama, e os argumentos de cada uma. */
export interface FuncoesDeDocumentos {
  registrar_envio_de_documento: {
    p_document_id: string;
    p_purpose: string;
    p_kind: string;
    p_object_path: string;
  };
  registrar_acesso_a_documento: { p_document_id: string };
  registrar_revisao_de_documento: {
    p_document_id: string;
    p_tipo: string;
    p_contexto: string;
    p_nota: string | null;
  };
}

export interface ClienteDeDocumentos {
  from<T>(tabela: TabelaDeDocumentos): Consulta<T> & Insercao;
  /**
   * `T` é a forma das linhas devolvidas. As funções que não devolvem linha
   * usam `never`, e aí só `error` importa.
   */
  rpc<T = never, N extends keyof FuncoesDeDocumentos = keyof FuncoesDeDocumentos>(
    nome: N,
    argumentos: FuncoesDeDocumentos[N],
  ): PromiseLike<{ data: T[] | null; error: ErroDeConsulta | null }>;
}

/**
 * Converte o cliente da sessão na visão acima.
 *
 * É uma conversão, e está isolada num lugar só para que seja uma conversão —
 * não trinta. A sessão continua sendo a de quem pede, e as policies continuam
 * valendo: isto muda o que o COMPILADOR vê, não o que o banco permite.
 */
export function comoClienteDeDocumentos(cliente: unknown): ClienteDeDocumentos {
  return cliente as ClienteDeDocumentos;
}

/* ─────────────────────────────────────────────────────────────────────────
   COMO APAGAR ESTE ARQUIVO

   Ele existe por uma razão temporária e some quando ela acabar. O caminho
   abaixo não encosta na instância proibida em nenhum passo.

   1. GERAR OS TIPOS DE UM DESTINO AUTORIZADO.

      O descartável `simulacao` tem as cinco tabelas da Etapa 1 e a função de
      registro, aplicadas em transação única com o histórico. Ele é um
      destino autorizado, e é dele que os tipos saem:

          npx supabase gen types typescript \
            --db-url "postgresql://postgres:<senha-local>@127.0.0.1:57325/postgres" \
            > /tmp/types-do-descartavel.ts

      A senha é a da pilha local, obtida pelo mesmo caminho das outras chaves
      locais; não entra no repositório nem em log.

   2. CONFERIR, NÃO SUBSTITUIR EM BLOCO.

      O arquivo gerado descreve o DESCARTÁVEL, que não é idêntico ao projeto
      de onde `types.ts` veio. Trocar um pelo outro traria diferenças que não
      têm nada a ver com documentos.

          diff <(grep -o '^      [a-z_]*: {' types-atuais.ts | sort -u) \
               <(grep -o '^      [a-z_]*: {' /tmp/types-do-descartavel.ts | sort -u)

      O que se aproveita é só o que falta hoje:

        - `document_consent_texts`, `document_consents`, `validation_documents`,
          `document_audit`, `document_retention_policy` em `Tables`;
        - `registrar_envio_de_documento` e `concluir_expurgo_de_documento`
          em `Functions`.

      Qualquer outra diferença é sinal de que as duas bases divergiram, e
      merece ser entendida antes de virar código.

   3. TROCAR E APAGAR.

      Com as tabelas nos tipos gerados, `db.from<T>(...)` vira
      `supabase.from(...)` tipado de verdade, `comoClienteDeDocumentos` sai de
      `fluxo.fn.ts` e este arquivo inteiro é removido. A remoção é mecânica
      porque aqui não há lógica — só forma.

   4. O QUE NÃO FAZER.

      Não gerar de `iaabxrclxpsagdijkrcx`, que segue proibida inclusive para
      consulta. Não editar `src/integrations/supabase/types.ts` à mão: ele diz
      na primeira linha que é gerado, e a próxima geração desfaz a edição.
   ───────────────────────────────────────────────────────────────────────── */
