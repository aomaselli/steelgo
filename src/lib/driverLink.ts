/**
 * Regras de vínculo motorista <-> transportadora, isoladas da tela.
 *
 * Estavam embutidas em condicionais de JSX, e foi ali que o fluxo quebrou:
 * a tela do motorista escondia TODO o bloco de vínculo assim que existisse
 * qualquer registro em `drivers`, inclusive o registro independente que ela
 * mesma criava ao carregar. O motorista ficava sem convite e sem solicitação.
 *
 * Nada aqui fala com o banco: o servidor continua sendo quem decide. Estas
 * funções apenas dizem qual caminho a interface pode oferecer.
 */

export type DriverLinkRecord = { carrier_id: string | null } | null | undefined;

export type DriverLinkState =
  /** Conta sem linha em `drivers`. */
  | "sem_registro"
  /** Registro próprio, sem transportadora. */
  | "independente"
  /** Registro vinculado a uma transportadora. */
  | "vinculado";

export function driverLinkState(record: DriverLinkRecord): DriverLinkState {
  if (!record) return "sem_registro";
  return record.carrier_id ? "vinculado" : "independente";
}

/**
 * O servidor recusa `accept_driver_invitation` quando já existe registro
 * independente ("use the carrier link request flow"). Oferecer o campo de
 * token nesse estado é oferecer um botão que sempre erra.
 */
export function canOfferInviteToken(state: DriverLinkState): boolean {
  return state === "sem_registro";
}

/** Solicitar vínculo vale enquanto não houver transportadora. */
export function canOfferLinkRequest(state: DriverLinkState): boolean {
  return state !== "vinculado";
}

/**
 * Criar o registro independente fecha o caminho do convite, então é escolha
 * explícita — nunca efeito colateral do carregamento da tela.
 */
export function canBecomeIndependent(state: DriverLinkState): boolean {
  return state === "sem_registro";
}

export type InviteContact =
  | { ok: true; email?: string; phone?: string }
  | { ok: false; reason: "sem_contato" };

/**
 * Convite precisa de pelo menos um contato. Telefone entra só com dígitos;
 * máscara ("(11) 90000-0000") não é contato por si só, e uma string com
 * apenas separadores tem de ser recusada como vazia.
 */
export function normalizeInviteContact(raw: { email: string; phone: string }): InviteContact {
  const email = raw.email.trim();
  const phone = raw.phone.replace(/\D/g, "");
  if (!email && !phone) return { ok: false, reason: "sem_contato" };
  return { ok: true, email: email || undefined, phone: phone || undefined };
}
