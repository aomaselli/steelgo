export const maskCPF = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

export const maskCNPJ = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");

export const maskPhone = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");

export const maskPlate = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7)
    .replace(/^([A-Z]{3})(\d)/, "$1-$2");

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

export const passwordStrength = (p: string): { score: 0 | 1 | 2 | 3; label: string; color: string } => {
  let s = 0;
  if (p.length >= 8) s++;
  if (/\d/.test(p)) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (s === 0) return { score: 0, label: "—", color: "bg-graphite-700" };
  if (s === 1) return { score: 1, label: "Fraca", color: "bg-red-500" };
  if (s === 2) return { score: 2, label: "Média", color: "bg-amber" };
  return { score: 3, label: "Forte", color: "bg-esg-green" };
};

export const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];
