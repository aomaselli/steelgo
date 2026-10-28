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
  // Esta existe nos tipos gerados. Entra aqui só para que a resolução de
  // papel passe pelo mesmo cliente das outras consultas, em vez de o módulo
  // carregar duas formas do mesmo objeto.
  | "user_roles";

export interface ErroDeConsulta {
  message: string;
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

export interface ClienteDeDocumentos {
  from<T>(tabela: TabelaDeDocumentos): Consulta<T> & Insercao;
  rpc(
    nome: "registrar_envio_de_documento",
    argumentos: {
      p_document_id: string;
      p_purpose: string;
      p_kind: string;
      p_object_path: string;
    },
  ): PromiseLike<{ error: ErroDeConsulta | null }>;
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
