import { describe, expect, it } from "vitest";
import {
  GOVERNED_COLUMNS,
  buildFreightPayload,
  firstIncompleteStep,
  isStepComplete,
  sanitizeDraft,
  toDbCategory,
  type FreightFormValues,
} from "./freightDraft";
import { STEEL_TYPES, steelLabel } from "./steel";

const completo: FreightFormValues = {
  steel_type: "chapa_grossa",
  weight_tons: 25,
  cargo_value_brl: 180000,
  volume_m3: "",
  notes: "",
  origin_city: "Ipatinga",
  origin_state: "MG",
  origin_name: "Av. Industrial",
  dest_city: "Betim",
  dest_state: "MG",
  dest_name: "Rod. Fernao Dias",
  distance_km: 230,
  category: "traditional",
  required_truck: ["carreta"],
  pickup_date: "2026-10-06",
  pickup_from: "08:00",
  pickup_to: "18:00",
  delivery_date: "2026-10-07",
  budget_brl: 4500,
  bid_deadline: "2026-10-05T18:00",
};

describe("buildFreightPayload — colunas governadas fora do payload", () => {
  // Defeito observado: com budget_brl no payload, create_freight_draft_core
  // aplicava a coluna governada num UPDATE sem evento de publicacao e o guarda
  // freights_enforce_publication_event recusava com 42501.
  it("nao inclui budget_brl", () => {
    expect(buildFreightPayload(completo)).not.toHaveProperty("budget_brl");
  });

  it("nao inclui nenhuma coluna governada", () => {
    const payload = buildFreightPayload(completo);
    for (const col of GOVERNED_COLUMNS) {
      expect(payload, `coluna governada ${col} vazou para o payload`).not.toHaveProperty(col);
    }
  });

  it("mantem os campos nao governados", () => {
    const p = buildFreightPayload(completo);
    expect(p.steel_type).toBe("chapa_grossa");
    expect(p.weight_tons).toBe(25);
    expect(p.cargo_value_brl).toBe(180000);
    expect(p.distance_km).toBe(230);
    expect(p.required_truck).toEqual(["carreta"]);
    expect(p.pickup_window).toBe("08:00-18:00");
  });

  it("transforma vazio e zero em nulo, como a RPC espera", () => {
    const p = buildFreightPayload({
      ...completo,
      weight_tons: "",
      cargo_value_brl: 0,
      distance_km: "",
      notes: "",
      required_truck: [],
      pickup_date: "",
    });
    expect(p.weight_tons).toBeNull();
    expect(p.cargo_value_brl).toBeNull();
    expect(p.distance_km).toBeNull();
    expect(p.notes).toBeNull();
    expect(p.required_truck).toBeNull();
    expect(p.pickup_date).toBeNull();
  });

  it("sem janela completa, pickup_window fica nulo", () => {
    expect(buildFreightPayload({ ...completo, pickup_to: "" }).pickup_window).toBeNull();
  });
});

describe("toDbCategory — a tela e o enum usam nomes diferentes", () => {
  it("green vira green_low_carbon", () => {
    expect(toDbCategory("green")).toBe("green_low_carbon");
  });
  it("green_ev e traditional passam direto", () => {
    expect(toDbCategory("green_ev")).toBe("green_ev");
    expect(toDbCategory("traditional")).toBe("traditional");
  });
});

describe("isStepComplete — etapa concluida exige dado, nao so ter passado", () => {
  it("todas as etapas completas no formulario cheio", () => {
    for (const s of [1, 2, 3, 4, 5]) {
      expect(isStepComplete(s, completo), `etapa ${s}`).toBe(true);
    }
    expect(firstIncompleteStep(completo)).toBeNull();
  });

  it("carga sem tipo de aco ou sem peso nao conclui", () => {
    expect(isStepComplete(1, { ...completo, steel_type: "" })).toBe(false);
    expect(isStepComplete(1, { ...completo, weight_tons: "" })).toBe(false);
    expect(isStepComplete(1, { ...completo, weight_tons: 0 })).toBe(false);
  });

  it("rota sem cidade ou sem UF nao conclui", () => {
    expect(isStepComplete(2, { ...completo, origin_city: "" })).toBe(false);
    expect(isStepComplete(2, { ...completo, dest_state: "" })).toBe(false);
  });

  it("logistica sem caminhao ou sem data de coleta nao conclui", () => {
    expect(isStepComplete(3, { ...completo, required_truck: [] })).toBe(false);
    expect(isStepComplete(3, { ...completo, pickup_date: "" })).toBe(false);
  });

  it("comercial sem orcamento positivo nao conclui", () => {
    expect(isStepComplete(4, { ...completo, budget_brl: "" })).toBe(false);
    expect(isStepComplete(4, { ...completo, budget_brl: 0 })).toBe(false);
  });

  it("revisao so conclui quando as quatro anteriores concluem", () => {
    expect(isStepComplete(5, { ...completo, origin_city: "" })).toBe(false);
  });

  it("formulario vazio aponta a etapa 1 como a primeira pendencia", () => {
    const vazio: FreightFormValues = {
      ...completo,
      steel_type: "",
      weight_tons: "",
      origin_city: "",
      origin_state: "",
      dest_city: "",
      dest_state: "",
      required_truck: [],
      pickup_date: "",
      budget_brl: "",
    };
    expect(firstIncompleteStep(vazio)).toBe(1);
    expect(isStepComplete(5, vazio)).toBe(false);
  });
});

describe("sanitizeDraft — rascunho antigo nao reintroduz valor fora do catalogo", () => {
  const acos = STEEL_TYPES.map((s) => s.id);
  const caminhoes = ["truck_simples", "toco", "carreta", "carreta_extendida", "bitrem", "rodotrem"];

  it("descarta steel_type que saiu do catalogo e avisa", () => {
    // "plate" era o id antigo da tela; o banco so aceita "chapa_grossa".
    const { draft, discarded } = sanitizeDraft({ steel_type: "plate" }, acos, caminhoes);
    expect(draft.steel_type).toBeUndefined();
    expect(discarded).toContain("tipo de aço");
  });

  it("mantem steel_type valido e nao avisa", () => {
    const { draft, discarded } = sanitizeDraft({ steel_type: "chapa_grossa" }, acos, caminhoes);
    expect(draft.steel_type).toBe("chapa_grossa");
    expect(discarded).toHaveLength(0);
  });

  it("descarta caminhao que nao existe no enum e preserva os validos", () => {
    const { draft, discarded } = sanitizeDraft(
      { required_truck: ["carreta", "carreta_ext", "prancha"] },
      acos,
      caminhoes,
    );
    expect(draft.required_truck).toEqual(["carreta"]);
    expect(discarded).toContain("tipo de caminhão");
  });

  it("nao mexe nos demais campos do rascunho", () => {
    const { draft } = sanitizeDraft(
      { steel_type: "plate", origin_city: "Ipatinga", weight_tons: 25 },
      acos,
      caminhoes,
    );
    expect(draft.origin_city).toBe("Ipatinga");
    expect(draft.weight_tons).toBe(25);
  });

  it("rascunho ja valido sai intacto", () => {
    const { draft, discarded } = sanitizeDraft(
      { steel_type: "vergalhao", required_truck: ["bitrem"] },
      acos,
      caminhoes,
    );
    expect(draft).toEqual({ steel_type: "vergalhao", required_truck: ["bitrem"] });
    expect(discarded).toHaveLength(0);
  });
});

describe("catalogo de aco — fonte unica e consistente", () => {
  it("todo id do catalogo tem rotulo proprio", () => {
    for (const s of STEEL_TYPES) {
      expect(steelLabel(s.id), `sem rotulo para ${s.id}`).toBe(s.label);
    }
  });

  it("ids sao unicos", () => {
    const ids = STEEL_TYPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("valor desconhecido volta como veio, para a divergencia aparecer", () => {
    expect(steelLabel("plate")).toBe("plate");
    expect(steelLabel(null)).toBe("—");
  });
});
