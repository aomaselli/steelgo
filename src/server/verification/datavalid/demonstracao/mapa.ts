/**
 * Mapeamento da massa fictícia oficial para o contrato V5.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O PROBLEMA
 *
 * `exemplos.json` — a massa publicada pelo SERPRO para o ambiente de
 * demonstração — NÃO está no formato da requisição. São dois formatos
 * diferentes para a mesma informação:
 *
 *   massa (plana, codificada)        requisição (aninhada, por extenso)
 *   ───────────────────────────      ──────────────────────────────────
 *   sexo: "F"                        validacao.sexo: "FEMININO"
 *   nacionalidade: "1"               validacao.nacionalidade: "BRASILEIRO"
 *   cnh_situacao: "3"                validacao.cnh.situacao: "EMITIDA"
 *   cnh_numero_registro: "..."       validacao.cnh.numero_registro: "..."
 *   endereco_cep: "04766-900"        validacao.endereco.cep: "04766900"
 *
 * É aqui que moram os erros silenciosos: um código traduzido por palpite não
 * falha, passa — e devolve uma validação que compara a coisa errada.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A REGRA: CÓDIGO SEM TABELA OFICIAL É RECUSADO, NUNCA CONVERTIDO
 *
 * Toda tabela abaixo vem de "Campos Disponíveis" na documentação oficial, com
 * a citação ao lado. Código que não esteja na tabela não é convertido por
 * semelhança, por ordem alfabética nem por "deve ser o primeiro da lista".
 *
 * O campo `cnh_possui_impedimento` é o caso que prova a regra. A massa traz
 * `"1"`. A requisição espera booleano. A documentação lista o campo com tabela
 * de domínio "-" — isto é, NÃO HÁ TABELA. Tratar `"1"` como `true` é
 * convenção de programador, não contrato: ninguém publicou que 1 significa
 * "possui". E é justamente o campo que, se lido ao contrário, reprova um
 * motorista habilitado ou aprova um impedido.
 *
 * Por isso ele é recusado, e o campo sai da requisição. Como TODO campo dentro
 * de `validacao` é opcional no OpenAPI, omitir é válido no contrato — e o
 * resultado volta sem a comparação desse campo, que é a resposta honesta:
 * não foi avaliado.
 */

/** Um registro da massa oficial, como vem no arquivo. */
export interface RegistroDaMassa {
  cpf: string;
  nome: string;
  nome_social?: string;
  sexo: string;
  data_nascimento: string;
  data_inscricao?: string;
  tipo_documento?: string;
  nacionalidade?: string;
  situacao_cpf?: string;
  nome_pai?: string;
  nome_mae?: string;
  numero_documento?: string;
  orgao_expedidor?: string;
  uf_expedidor?: string;
  endereco_logradouro?: string;
  endereco_numero?: string;
  endereco_complemento?: string;
  endereco_bairro?: string;
  endereco_cep?: string;
  endereco_municipio?: string;
  endereco_uf?: string;
  cnh_categoria?: string;
  cnh_observacoes?: string;
  cnh_numero_registro?: string;
  cnh_data_primeira_habilitacao?: string;
  cnh_data_validade?: string;
  cnh_data_ultima_emissao?: string;
  cnh_situacao?: string;
  cnh_registro_nacional_estrangeiro?: string;
  cnh_possui_impedimento?: string;
  /** Base64. NUNCA entra em log nem em trilha. */
  qrcode?: string;
  /** Base64. NUNCA entra em log nem em trilha. */
  biometria_face?: string;
  /** Base64. NUNCA entra em log nem em trilha. */
  polegar_direito?: string;
}

// ───────────────────── tabelas oficiais de domínio ─────────────────────────

/**
 * "Campos Disponíveis": `sexo` — "F - feminino  M - masculino  O - outro".
 * Enum da requisição: MASCULINO | FEMININO | OUTRO.
 */
const SEXO: Readonly<Record<string, "MASCULINO" | "FEMININO" | "OUTRO">> = {
  F: "FEMININO",
  M: "MASCULINO",
  O: "OUTRO",
};

/**
 * "Campos Disponíveis": `nacionalidade` — "1 - brasileiro  2 - brasileiro
 * naturalizado  3 - estrangeiro  4 - brasileiro nascido no exterior".
 */
const NACIONALIDADE: Readonly<Record<string, string>> = {
  "1": "BRASILEIRO",
  "2": "BRASILEIRO_NATURALIZADO",
  "3": "ESTRANGEIRO",
  "4": "BRASILEIRO_NASCIDO_EXTERIOR",
};

/**
 * "Campos Disponíveis": `documento/tipo` — "1 - carteira de identidade
 * 2 - carteira profissional  3 - passaporte  4 - carteira (reservista)".
 * Enum da requisição: RG | CARTEIRA_PROFISSIONAL | PASSAPORTE | CARTEIRA_RESERVISTA.
 */
const TIPO_DOCUMENTO: Readonly<Record<string, string>> = {
  "1": "RG",
  "2": "CARTEIRA_PROFISSIONAL",
  "3": "PASSAPORTE",
  "4": "CARTEIRA_RESERVISTA",
};

/**
 * "Campos Disponíveis": `codigo_situacao` da CNH — "2 - em emissão
 * 3 - emitida  A - cancelada". O próprio artigo registra a redução a três
 * opções.
 */
const CNH_SITUACAO: Readonly<Record<string, "EM_EMISSAO" | "EMITIDA" | "CANCELADA">> = {
  "2": "EM_EMISSAO",
  "3": "EMITIDA",
  A: "CANCELADA",
};

/**
 * `situacao_cpf`: a documentação lista os valores por extenso, e a massa os
 * traz em minúsculas. Normalizar caixa e acento não é supor nada — é a mesma
 * palavra.
 */
const SITUACAO_CPF: Readonly<Record<string, string>> = {
  regular: "REGULAR",
  suspensa: "SUSPENSA",
  "titular falecido": "TITULAR_FALECIDO",
  "pendente de regularizacao": "PENDENTE_REGULARIZACAO",
  "cancelada por multiplicidade": "CANCELADA_MULTIPLICIDADE",
  nula: "NULA",
  "cancelada de oficio": "CANCELADA_OFICIO",
};

const UF = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

/**
 * Campos SEM tabela de domínio publicada. Não se converte o que não foi
 * documentado — nem quando a convenção parece óbvia.
 */
const SEM_TABELA_OFICIAL: Readonly<Record<string, string>> = {
  cnh_possui_impedimento:
    'a documentação lista `possui_impedimento` com tabela de domínio "-", ' +
    "ou seja, sem tabela. A requisição espera booleano e a massa traz código " +
    'numérico. Ler "1" como verdadeiro é convenção, não contrato — e é o campo ' +
    "que, invertido, reprova habilitado ou aprova impedido.",
};

// ──────────────────────────── resultado ────────────────────────────────────

export class CodigoDesconhecidoError extends Error {
  readonly campo: string;
  readonly codigo: string;
  constructor(campo: string, codigo: string, conhecidos: string[]) {
    super(
      `Código desconhecido em "${campo}": ${JSON.stringify(codigo)}. ` +
        `A tabela oficial tem ${JSON.stringify(conhecidos)}. ` +
        `Não há conversão por suposição: o campo é omitido e a comparação ` +
        `correspondente volta como não avaliada.`,
    );
    this.name = "CodigoDesconhecidoError";
    this.campo = campo;
    this.codigo = codigo;
  }
}

/**
 * Vocabulário de consentimento — a lista FECHADA de `parametros` que a GCC
 * aceita autorizar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ELE É MAIS ESTREITO QUE A REQUISIÇÃO, E ISSO IMPORTA
 *
 * Esta lista não foi deduzida: é a que o próprio serviço devolve no corpo do
 * HTTP 400 quando se manda um nome fora dela ("parametros permitidos: [...]"),
 * e coincide com a do exemplo oficial do OpenAPI.
 *
 * Repare no que NÃO está nela: `situacao_cpf`, `nome_social` e
 * `data_inscricao_cpf` — justamente os campos do bloco `validacao.rfb`. E
 * repare que não existe prefixo `rfb.`: `cnh.` e `endereco.` existem, `rfb.`
 * não.
 *
 * A consequência é a regra abaixo: **só se envia o que o consentimento
 * cobre.** Mandar um campo que o token não autoriza é tratar dado sem base —
 * exatamente o que a Portaria 139/2025 e a LGPD endereçam. Omitir e relatar é
 * a única saída honesta; a outra seria pedir consentimento de um campo com o
 * nome de outro.
 */
export const PARAMETROS_DE_CONSENTIMENTO: ReadonlySet<string> = new Set([
  "biometria_digital",
  "biometria_facial",
  "cnh.categoria",
  "cnh.data_primeira_habilitacao",
  "cnh.data_ultima_emissao",
  "cnh.data_validade",
  "cnh.numero_registro",
  "cnh.observacoes",
  "cnh.possui_impedimento",
  "cnh.registro_nacional_estrangeiro",
  "cnh.situacao",
  "cpf",
  "data_nascimento",
  "endereco.bairro",
  "endereco.cep",
  "endereco.complemento",
  "endereco.logradouro",
  "endereco.municipio",
  "endereco.numero",
  "endereco.uf",
  "nacionalidade",
  "nome",
  "nome_mae",
  "nome_pai",
  "numero_documento_origem",
  "orgao_expedidor_documento_origem",
  "qrcode",
  "sexo",
  "tipo_documento_origem",
  "uf_expedidor_documento_origem",
]);

/** Campo que ficou de fora, e por quê. Entra no relatório, não no silêncio. */
export interface CampoOmitido {
  campo: string;
  /** O código recusado. É dado da massa fictícia, não de pessoa real. */
  codigo: string;
  motivo:
    | "SEM_TABELA_OFICIAL"
    | "CODIGO_FORA_DA_TABELA"
    | "AUSENTE_NA_MASSA"
    | "SEM_PARAMETRO_DE_CONSENTIMENTO"
    | "FORMATO_NAO_RECONHECIDO";
  detalhe: string;
}

export interface CorpoDeValidacao {
  cpf: string;
  validacao: Record<string, unknown>;
}

export interface ResultadoDoMapeamento {
  corpo: CorpoDeValidacao;
  /** Tudo que não entrou, com motivo. Lista vazia é a exceção, não a regra. */
  omitidos: CampoOmitido[];
}

function traduzir(
  campo: string,
  valor: string | undefined,
  tabela: Readonly<Record<string, string>>,
  omitidos: CampoOmitido[],
  { estrito = true }: { estrito?: boolean } = {},
): string | undefined {
  if (valor === undefined || valor === "") {
    omitidos.push({
      campo,
      codigo: "",
      motivo: "AUSENTE_NA_MASSA",
      detalhe: "o registro não traz este campo",
    });
    return undefined;
  }
  const traduzido = tabela[valor];
  if (traduzido === undefined) {
    const erro = new CodigoDesconhecidoError(campo, valor, Object.keys(tabela));
    if (estrito) throw erro;
    omitidos.push({
      campo,
      codigo: valor,
      motivo: "CODIGO_FORA_DA_TABELA",
      detalhe: erro.message,
    });
    return undefined;
  }
  return traduzido;
}

/** Remove máscara de CEP. A requisição espera só dígitos. */
function cepSemMascara(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const digitos = v.replace(/\D/g, "");
  return digitos.length === 8 ? digitos : undefined;
}

/**
 * Mapeia um registro da massa para o corpo de validação.
 *
 * `estrito` decide o que fazer com código fora da tabela: `true` LANÇA — o que
 * se quer num teste e numa esteira de verdade — e `false` omite o campo e
 * registra o motivo, que é o que a homologação ponta a ponta precisa para
 * seguir e relatar.
 *
 * Em nenhum dos dois casos o código é convertido.
 */
export function mapearRegistro(
  r: RegistroDaMassa,
  { estrito = true }: { estrito?: boolean } = {},
): ResultadoDoMapeamento {
  const omitidos: CampoOmitido[] = [];
  const validacao: Record<string, unknown> = {};

  // Biográficos diretos — sem tradução, logo sem risco de suposição.
  if (r.nome) validacao.nome = r.nome;
  if (r.data_nascimento) validacao.data_nascimento = r.data_nascimento;
  if (r.nome_mae) validacao.nome_mae = r.nome_mae;
  if (r.nome_pai) validacao.nome_pai = r.nome_pai;
  if (r.numero_documento) validacao.numero_documento_origem = r.numero_documento;
  if (r.orgao_expedidor) validacao.orgao_expedidor_documento_origem = r.orgao_expedidor;

  // Codificados, por tabela oficial.
  const sexo = traduzir("sexo", r.sexo, SEXO, omitidos, { estrito });
  if (sexo) validacao.sexo = sexo;

  const nacionalidade = traduzir("nacionalidade", r.nacionalidade, NACIONALIDADE, omitidos, { estrito });
  if (nacionalidade) validacao.nacionalidade = nacionalidade;

  const tipoDoc = traduzir("tipo_documento", r.tipo_documento, TIPO_DOCUMENTO, omitidos, { estrito });
  if (tipoDoc) validacao.tipo_documento_origem = tipoDoc;

  if (r.uf_expedidor) {
    if (UF.has(r.uf_expedidor)) {
      validacao.uf_expedidor_documento_origem = r.uf_expedidor;
    } else if (estrito) {
      throw new CodigoDesconhecidoError("uf_expedidor", r.uf_expedidor, [...UF]);
    } else {
      omitidos.push({
        campo: "uf_expedidor",
        codigo: r.uf_expedidor,
        motivo: "CODIGO_FORA_DA_TABELA",
        detalhe: "não é uma UF do enum da requisição",
      });
    }
  }

  // Endereço.
  const endereco: Record<string, unknown> = {};
  if (r.endereco_logradouro) endereco.logradouro = r.endereco_logradouro;
  if (r.endereco_numero) endereco.numero = r.endereco_numero;
  if (r.endereco_complemento) endereco.complemento = r.endereco_complemento;
  if (r.endereco_bairro) endereco.bairro = r.endereco_bairro;
  const cep = cepSemMascara(r.endereco_cep);
  if (cep) endereco.cep = cep;
  else if (r.endereco_cep) {
    omitidos.push({
      campo: "endereco_cep",
      codigo: r.endereco_cep,
      motivo: "CODIGO_FORA_DA_TABELA",
      detalhe: "CEP não tem 8 dígitos depois de retirar a máscara",
    });
  }
  if (r.endereco_municipio) endereco.municipio = r.endereco_municipio;
  if (r.endereco_uf) {
    if (UF.has(r.endereco_uf)) endereco.uf = r.endereco_uf;
    else if (estrito) throw new CodigoDesconhecidoError("endereco_uf", r.endereco_uf, [...UF]);
    else
      omitidos.push({
        campo: "endereco_uf",
        codigo: r.endereco_uf,
        motivo: "CODIGO_FORA_DA_TABELA",
        detalhe: "não é uma UF do enum da requisição",
      });
  }
  if (Object.keys(endereco).length > 0) validacao.endereco = endereco;

  // Bloco RFB.
  const rfb: Record<string, unknown> = {};
  if (r.nome_social) rfb.nome_social = r.nome_social;
  if (r.situacao_cpf) {
    const chave = r.situacao_cpf
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    const s = traduzir("situacao_cpf", chave, SITUACAO_CPF, omitidos, { estrito });
    if (s) rfb.situacao_cpf = s;
  }
  if (r.data_inscricao) rfb.data_inscricao_cpf = r.data_inscricao;
  if (Object.keys(rfb).length > 0) validacao.rfb = rfb;

  // Bloco CNH.
  const cnh: Record<string, unknown> = {};
  if (r.cnh_numero_registro) cnh.numero_registro = r.cnh_numero_registro;
  // `categoria` não tem enum no OpenAPI: é texto. Passa como está.
  if (r.cnh_categoria) cnh.categoria = r.cnh_categoria;
  if (r.cnh_observacoes) cnh.observacoes = r.cnh_observacoes;
  if (r.cnh_registro_nacional_estrangeiro) {
    cnh.registro_nacional_estrangeiro = r.cnh_registro_nacional_estrangeiro;
  }
  if (r.cnh_data_primeira_habilitacao) {
    cnh.data_primeira_habilitacao = r.cnh_data_primeira_habilitacao;
  }
  if (r.cnh_data_ultima_emissao) cnh.data_ultima_emissao = r.cnh_data_ultima_emissao;
  if (r.cnh_data_validade) cnh.data_validade = r.cnh_data_validade;

  const situacao = traduzir("cnh_situacao", r.cnh_situacao, CNH_SITUACAO, omitidos, { estrito });
  if (situacao) cnh.situacao = situacao;

  // O campo que prova a regra: sem tabela oficial, não se converte.
  if (r.cnh_possui_impedimento !== undefined && r.cnh_possui_impedimento !== "") {
    omitidos.push({
      campo: "cnh_possui_impedimento",
      codigo: r.cnh_possui_impedimento,
      motivo: "SEM_TABELA_OFICIAL",
      detalhe: SEM_TABELA_OFICIAL.cnh_possui_impedimento,
    });
  }

  if (Object.keys(cnh).length > 0) validacao.cnh = cnh;

  // Última passada: retira o que o consentimento não cobre.
  const podados = podarForaDoConsentimento(validacao, omitidos);

  return { corpo: { cpf: r.cpf, validacao: podados }, omitidos };
}

/**
 * Objetos da requisição que são FOLHAS no vocabulário de consentimento.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ISTO CONSERTA
 *
 * `cnh` e `endereco` são objetos cujos campos aparecem no vocabulário um a um
 * (`cnh.situacao`, `endereco.cep`). `qrcode` e as biometrias também são
 * objetos na requisição — `{ formato, base64, essencial }` — mas no
 * vocabulário aparecem com o NOME INTEIRO, sem desdobramento.
 *
 * A primeira versão descia em todos igualmente e produzia `qrcode.formato`,
 * `qrcode.base64`… nenhum dos quais existe no vocabulário. O resultado era um
 * token que NÃO autorizava `qrcode`, seguido de uma requisição que o enviava
 * — e o serviço devolvia **HTTP 422**, recusando com razão.
 *
 * Levei esse 422 por engano a uma hipótese de "QR Code sozinho não vale";
 * duas sondas contra o serviço mostraram que sozinho vale (200), e que o que
 * não valia era o descasamento entre o consentimento e o enviado. A recusa do
 * serviço estava certa; o defeito era meu.
 */
const FOLHAS_DO_VOCABULARIO: ReadonlySet<string> = new Set([
  "qrcode",
  "biometria_facial",
  "biometria_facial_de_referencia",
  "biometria_digital",
]);

/** Nome do campo no vocabulário de consentimento: `cnh.situacao`, `nome`, … */
export function nomeDeConsentimento(caminho: readonly string[]): string {
  // O bloco `rfb` não tem prefixo no vocabulário, e seus campos simplesmente
  // não constam. Mantê-lo no caminho faria a busca falhar pelo motivo errado.
  return caminho.join(".");
}

/**
 * Remove de `validacao` todo campo sem parâmetro de consentimento.
 *
 * Percorre só um nível de aninhamento porque o contrato tem só um: `cnh.*`,
 * `endereco.*` e `rfb.*`. Um nível mais fundo exigiria rever o vocabulário,
 * não estender esta função às cegas.
 */
function podarForaDoConsentimento(
  validacao: Record<string, unknown>,
  omitidos: CampoOmitido[],
): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(validacao)) {
    // Folha do vocabulario: o objeto inteiro vale pelo nome dele. Descer
    // aqui destruiria `{ formato, base64 }` e produziria consentimento com
    // nomes que nao existem.
    if (FOLHAS_DO_VOCABULARIO.has(chave)) {
      if (PARAMETROS_DE_CONSENTIMENTO.has(chave)) saida[chave] = valor;
      else
        omitidos.push({
          campo: chave,
          codigo: "",
          motivo: "SEM_PARAMETRO_DE_CONSENTIMENTO",
          detalhe: `"${chave}" nao esta no vocabulario de consentimento da GCC.`,
        });
      continue;
    }
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      const interno: Record<string, unknown> = {};
      for (const [sub, v] of Object.entries(valor as Record<string, unknown>)) {
        const nome = nomeDeConsentimento([chave, sub]);
        if (PARAMETROS_DE_CONSENTIMENTO.has(nome)) interno[sub] = v;
        else
          omitidos.push({
            campo: `${chave}.${sub}`,
            codigo: "",
            motivo: "SEM_PARAMETRO_DE_CONSENTIMENTO",
            detalhe:
              `"${nome}" não está no vocabulário de consentimento da GCC. ` +
              `Enviar campo que o token não autoriza é tratar dado sem base.`,
          });
      }
      if (Object.keys(interno).length > 0) saida[chave] = interno;
      continue;
    }
    const nome = nomeDeConsentimento([chave]);
    if (PARAMETROS_DE_CONSENTIMENTO.has(nome)) saida[chave] = valor;
    else
      omitidos.push({
        campo: chave,
        codigo: "",
        motivo: "SEM_PARAMETRO_DE_CONSENTIMENTO",
        detalhe:
          `"${nome}" não está no vocabulário de consentimento da GCC. ` +
          `Enviar campo que o token não autoriza é tratar dado sem base.`,
      });
  }
  return saida;
}

/**
 * Os `parametros` a pedir à GCC, a partir do corpo já podado.
 *
 * Pede consentimento do que vai de fato, e só. Pedir a lista inteira "para
 * garantir" seria coletar autorização que não se usa.
 */
export function parametrosDoCorpo(validacao: Record<string, unknown>): string[] {
  const nomes = new Set<string>(["cpf"]);
  for (const [chave, valor] of Object.entries(validacao)) {
    if (FOLHAS_DO_VOCABULARIO.has(chave)) {
      if (PARAMETROS_DE_CONSENTIMENTO.has(chave)) nomes.add(chave);
      continue;
    }
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      for (const sub of Object.keys(valor as Record<string, unknown>)) {
        const n = nomeDeConsentimento([chave, sub]);
        if (PARAMETROS_DE_CONSENTIMENTO.has(n)) nomes.add(n);
      }
      continue;
    }
    const n = nomeDeConsentimento([chave]);
    if (PARAMETROS_DE_CONSENTIMENTO.has(n)) nomes.add(n);
  }
  return [...nomes].sort();
}

// ─────────────────── imagens: formato lido, não suposto ───────────────────

/**
 * O formato da imagem NÃO vem declarado na massa.
 *
 * A requisição exige `formato` — `JPG`, `PNG` ou `PDF` para a face, e esses
 * mais `RAW` para o QR Code. A massa traz só o base64. Declarar "PNG porque
 * geralmente é" seria a mesma falha das tabelas de código, noutro campo: um
 * formato errado não falha de imediato — o serviço tenta decodificar e devolve
 * um resultado que ninguém sabe interpretar.
 *
 * Então o formato é LIDO dos primeiros bytes. Número mágico não é suposição:
 * é o que o arquivo diz de si mesmo. Os três campos da massa oficial
 * (`biometria_face`, `polegar_direito`, `qrcode`) se identificam como PNG.
 */
const NUMEROS_MAGICOS: ReadonlyArray<{ hex: string; formato: "JPG" | "PNG" | "PDF" }> = [
  { hex: "ffd8ff", formato: "JPG" },
  { hex: "89504e47", formato: "PNG" },
  { hex: "25504446", formato: "PDF" },
];

export class FormatoNaoReconhecidoError extends Error {
  readonly campo: string;
  constructor(campo: string, primeirosBytes: string) {
    super(
      `Formato de "${campo}" não reconhecido pelos primeiros bytes ` +
        `(${primeirosBytes}). A requisição exige \`formato\`, e declará-lo por ` +
        `convenção seria chutar.`,
    );
    this.name = "FormatoNaoReconhecidoError";
    this.campo = campo;
  }
}

/** Lê o formato dos primeiros bytes do base64. `null` quando não reconhece. */
export function detectarFormato(base64: string): "JPG" | "PNG" | "PDF" | null {
  const cabecalho = primeirosBytesEmHex(base64.slice(0, 24));
  for (const { hex, formato } of NUMEROS_MAGICOS) {
    if (cabecalho.startsWith(hex)) return formato;
  }
  return null;
}

/** Decodifica base64 sem depender de `Buffer` nem de `atob`. */
function primeirosBytesEmHex(b64: string): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let bits = "";
  for (const c of b64) {
    const i = alfabeto.indexOf(c);
    if (i < 0) continue;
    bits += i.toString(2).padStart(6, "0");
  }
  let hex = "";
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    hex += parseInt(bits.slice(i, i + 8), 2)
      .toString(16)
      .padStart(2, "0");
  }
  return hex;
}

/** Anexo de imagem, já com o formato lido do conteúdo. */
export interface AnexoDeImagem {
  formato: "JPG" | "PNG" | "PDF";
  base64: string;
}

/**
 * Prepara um anexo, recusando o que não se consegue identificar.
 *
 * `estrito` tem o mesmo papel do mapeamento: lança, ou devolve `null` e
 * registra. Em nenhum dos dois declara formato por convenção.
 */
export function prepararAnexo(
  campo: string,
  base64: string | undefined,
  omitidos: CampoOmitido[],
  { estrito = true }: { estrito?: boolean } = {},
): AnexoDeImagem | null {
  if (!base64) {
    omitidos.push({
      campo,
      codigo: "",
      motivo: "AUSENTE_NA_MASSA",
      detalhe: "o registro não traz este campo",
    });
    return null;
  }
  const formato = detectarFormato(base64);
  if (!formato) {
    const erro = new FormatoNaoReconhecidoError(campo, base64.slice(0, 12) + "…");
    if (estrito) throw erro;
    omitidos.push({
      campo,
      codigo: "",
      motivo: "FORMATO_NAO_RECONHECIDO",
      detalhe: erro.message,
    });
    return null;
  }
  return { formato, base64 };
}
