// Amostragem no cliente (espelho da regra do servidor, migration 82). O servidor
// continua a autoridade; aqui so provamos que o cliente nao envia o que a
// politica manda descartar e que usa os valores devolvidos pelo servidor.
import { describe, expect, it } from "vitest";
import { distanceM, isSameFix, parseTrackingPolicy, sampleVerdict } from "./trackingPolicy";

const V2 = parseTrackingPolicy({
  version: 2,
  accuracy_primary_m: 100,
  accuracy_reject_m: 500,
  location_batch_max_points: 200,
  location_max_age_hours: 72,
  location_min_interval_s: 30,
  location_min_distance_m: 50,
  location_stationary_interval_s: 120,
  location_flush_interval_s: 30,
});
const V1 = parseTrackingPolicy({ version: 1, accuracy_reject_m: 500 });
const T0 = "2026-09-21T10:00:00.000Z";
const at = (s: number) => new Date(Date.parse(T0) + s * 1000).toISOString();
const pt = (s: number, dlat = 0, acc = 10) => ({
  lat: -19.97 + dlat,
  lng: -44.2,
  accuracy_m: acc,
  captured_at: at(s),
});
const M = 1 / 111_320; // ~1 m em graus de latitude

describe("parseTrackingPolicy", () => {
  it("le os valores do servidor; sem politica usa v1 conservadora (sem amostragem)", () => {
    expect(V2).toMatchObject({
      location_min_interval_s: 30,
      location_min_distance_m: 50,
      location_stationary_interval_s: 120,
      location_flush_interval_s: 30,
    });
    expect(parseTrackingPolicy(null)).toMatchObject({
      accuracy_reject_m: 500,
      location_min_interval_s: null,
      location_batch_max_points: 200,
    });
    expect(parseTrackingPolicy({ location_batch_max_points: 9999 }).location_batch_max_points).toBe(
      200,
    );
  });
});

describe("sampleVerdict (v2)", () => {
  it("primeiro ponto sempre segue", () => {
    expect(sampleVerdict(null, pt(0), V2)).toEqual({ keep: true });
  });
  it("mesmo fix repetido pelo watch (mesmo captured_at) -> duplicate_fix", () => {
    expect(sampleVerdict(pt(0), pt(0, 0.01), V2)).toEqual({ keep: false, why: "duplicate_fix" });
  });
  it("mesmas coordenadas/precisao no mesmo segundo -> duplicate_fix", () => {
    const a = pt(0);
    const b = { ...a, captured_at: new Date(Date.parse(T0) + 300).toISOString() };
    expect(isSameFix(a, b)).toBe(true);
  });
  it("dt < 30 s com grande distancia -> min_interval (piso absoluto)", () => {
    expect(sampleVerdict(pt(0), pt(10, 1500 * M), V2)).toEqual({
      keep: false,
      why: "min_interval",
    });
    expect(sampleVerdict(pt(0), pt(29, 1500 * M), V2)).toEqual({
      keep: false,
      why: "min_interval",
    });
  });
  it("30 s + 50 m -> elegivel; 30 s + 40 m -> no_movement", () => {
    expect(sampleVerdict(pt(0), pt(30, 60 * M), V2)).toEqual({ keep: true });
    expect(sampleVerdict(pt(0), pt(30, 40 * M), V2)).toEqual({ keep: false, why: "no_movement" });
  });
  it("parado: 119 s -> no_movement; 120 s -> elegivel", () => {
    expect(sampleVerdict(pt(0), pt(119), V2)).toEqual({ keep: false, why: "no_movement" });
    expect(sampleVerdict(pt(0), pt(120), V2)).toEqual({ keep: true });
  });
  it("compara com o ultimo ACEITO, nao com o ultimo callback", () => {
    const last = pt(0);
    // callbacks brutos em 10 s e 20 s foram descartados; em 30 s a distancia e medida desde `last`
    expect(sampleVerdict(last, pt(10, 30 * M), V2).keep).toBe(false);
    expect(sampleVerdict(last, pt(20, 45 * M), V2).keep).toBe(false);
    expect(sampleVerdict(last, pt(30, 55 * M), V2)).toEqual({ keep: true });
  });
  it("precisao acima de accuracy_reject_m da politica -> accuracy_rejected", () => {
    expect(sampleVerdict(pt(0), pt(60, 500 * M, 900), V2)).toEqual({
      keep: false,
      why: "accuracy_rejected",
    });
  });
  it("v1 (sem amostragem): so dedup e precisao", () => {
    expect(sampleVerdict(pt(0), pt(1, 1 * M), V1)).toEqual({ keep: true });
    expect(sampleVerdict(pt(0), pt(0), V1)).toEqual({ keep: false, why: "duplicate_fix" });
    expect(sampleVerdict(pt(0), pt(1, 0, 900), V1)).toEqual({
      keep: false,
      why: "accuracy_rejected",
    });
  });
  it("distanceM: ~111 m por 0,001 grau de latitude", () => {
    expect(Math.round(distanceM({ lat: -19.97, lng: -44.2 }, { lat: -19.969, lng: -44.2 }))).toBe(
      111,
    );
  });
});
