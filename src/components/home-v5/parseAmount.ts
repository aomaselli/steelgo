type Messages = { empty: string; negative: string; invalid: string; range: string };
type Parsed = { ok: true; val: number } | { ok: false; err: string };

// Accept either decimal separator. Mixed separators require valid grouping;
// malformed values must never silently become a smaller number.
export function parseAmount(raw: string, min: number, max: number, msgs: Messages): Parsed {
  const v = raw.trim();
  if (!v) return { ok: false, err: msgs.empty };
  if (v.startsWith("-")) return { ok: false, err: msgs.negative };
  let normalized: string;
  if (/^\d+$/.test(v)) normalized = v;
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) normalized = v.replaceAll(".", "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) normalized = v.replaceAll(",", "");
  else if (/^\d+[.,]\d+$/.test(v)) normalized = v.replace(",", ".");
  else return { ok: false, err: msgs.invalid };
  const n = Number(normalized);
  if (!Number.isFinite(n)) return { ok: false, err: msgs.invalid };
  if (n < min || n > max) return { ok: false, err: msgs.range };
  return { ok: true, val: n };
}
