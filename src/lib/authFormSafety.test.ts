import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Invariante de FONTE para os formulários de autenticação.
 *
 * O defeito: um `<form onSubmit={...}>` só é interceptado pelo React depois da
 * hidratação. Antes disso o envio é nativo, e sem `method` o padrão é **GET** —
 * os campos vão para a barra de endereço. Observado nesta aplicação: um toque
 * em "Entrar" antes da hidratação levou a `/login?email=…&password=…`.
 *
 * Duas barreiras, e este teste cobra as duas em cada formulário:
 *   1. `method="post"` — se um envio nativo escapar, os campos vão no corpo,
 *      nunca na URL;
 *   2. botão de envio desabilitado até hidratar — fecha o clique E o Enter,
 *      porque o envio implícito por Enter exige um botão de envio habilitado.
 *
 * É teste de fonte, não de render: não há biblioteca de render instalada, e o
 * que precisa não regredir é exatamente o par de atributos. O comportamento foi
 * conferido no navegador, com JavaScript indisponível, lento e já hidratado.
 */
const ARQUIVOS = [
  "src/pages/auth/LoginPage.tsx",
  "src/pages/auth/RegisterPage.tsx",
  "src/routes/forgot-password.tsx",
  "src/routes/reset-password.tsx",
] as const;

function ler(p: string) {
  return readFileSync(p, "utf8");
}

describe("formulários de autenticação: nada vai para a URL antes da hidratação", () => {
  it.each(ARQUIVOS)("%s: todo <form> declara method=\"post\"", (arquivo) => {
    const forms = ler(arquivo).match(/<form\b[^>]*>/g) ?? [];
    expect(forms.length, `${arquivo} deveria ter ao menos um <form>`).toBeGreaterThan(0);
    for (const f of forms) {
      expect(f, `form sem method="post" em ${arquivo}: ${f}`).toMatch(/method="post"/);
    }
  });

  it.each(ARQUIVOS)("%s: todo botão de envio espera a hidratação", (arquivo) => {
    const fonte = ler(arquivo);
    // Botões nativos (`type="submit"`) e o componente Button com type="submit".
    const trechos = fonte.match(/type="submit"[\s\S]{0,220}?(?:>|\/>)/g) ?? [];
    expect(trechos.length, `${arquivo} deveria ter ao menos um botão de envio`).toBeGreaterThan(0);
    for (const t of trechos) {
      expect(t, `botão de envio sem !hydrated em ${arquivo}:\n${t}`).toMatch(/disabled=\{!hydrated/);
    }
  });

  it.each(ARQUIVOS)("%s: usa o sinal de hidratação de um lugar só", (arquivo) => {
    expect(ler(arquivo)).toMatch(/useHydrated/);
  });

  it("nenhum formulário de autenticação usa method=\"get\"", () => {
    for (const arquivo of ARQUIVOS) {
      expect(ler(arquivo), arquivo).not.toMatch(/<form\b[^>]*method="get"/i);
    }
  });
});
