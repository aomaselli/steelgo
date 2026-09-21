// driver_carrier_requests: o embed correto passa por carriers.company_id ->
// companies (carriers NAO tem company_name/trade_name: o antigo dava 42703/400).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CARRIER_REQUEST_SELECT, carrierRequestLabel } from "./carrierRequestLabel";

describe("carrierRequestLabel / CARRIER_REQUEST_SELECT", () => {
  it("select nao referencia colunas inexistentes em carriers", () => {
    expect(CARRIER_REQUEST_SELECT).toContain("carriers(company_id, companies(name, trade_name))");
    expect(CARRIER_REQUEST_SELECT).not.toMatch(/carriers\((?![^)]*company_id)/);
    // colunas diretas de carriers antes do embed aninhado: so company_id
    expect(CARRIER_REQUEST_SELECT).toMatch(/carriers\(company_id, companies\(/);
    expect(CARRIER_REQUEST_SELECT).not.toMatch(/carriers\((company_name|trade_name)/);
  });
  it("DriverHomePage usa a constante (fonte unica) e nao o embed antigo", () => {
    const src = readFileSync(join(__dirname, "../pages/driver/DriverHomePage.tsx"), "utf8");
    expect(src).toContain("CARRIER_REQUEST_SELECT");
    expect(src).not.toMatch(/carriers\(company_name/);
  });
  it("rotulo: nome -> nome fantasia -> fallback neutro (ausencia de registro nao e erro)", () => {
    expect(
      carrierRequestLabel({
        carriers: { company_id: "c", companies: { name: "Transp X", trade_name: "TX" } },
      }),
    ).toBe("Transp X");
    expect(
      carrierRequestLabel({
        carriers: { company_id: "c", companies: { name: null, trade_name: "TX" } },
      }),
    ).toBe("TX");
    expect(carrierRequestLabel({ carriers: { company_id: "c", companies: null } })).toBe(
      "Transportadora",
    );
    expect(carrierRequestLabel({ carriers: null })).toBe("Transportadora");
    expect(carrierRequestLabel({})).toBe("Transportadora");
  });
});
