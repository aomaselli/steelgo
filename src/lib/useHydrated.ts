import { useEffect, useState } from "react";

/**
 * Falso no servidor e no primeiro render do cliente; verdadeiro depois que o
 * React hidratou e os manipuladores estão ligados.
 *
 * POR QUE ISTO EXISTE. Um `<form onSubmit={...}>` só é interceptado pelo React
 * **depois da hidratação**. Antes disso o formulário é HTML comum: tocar no
 * botão de enviar, ou pressionar Enter num campo, dispara o envio NATIVO do
 * navegador. Sem `method`, o padrão é **GET** — e os campos vão para a barra de
 * endereço. Num formulário de login, isso põe a senha na URL, que entra no
 * histórico do navegador, no `Referer` e em qualquer registro de acesso pelo
 * caminho.
 *
 * Observado nesta aplicação em 05/10/2026, com credencial sintética de ensaio:
 * um toque em "Entrar" antes da hidratação levou a
 * `/login?email=…&password=…`.
 *
 * Com este sinal, o botão de enviar fica desabilitado até a hidratação. Botão
 * de envio desabilitado também bloqueia o envio implícito por Enter, então os
 * dois caminhos ficam fechados. Em conexão lenta a pessoa espera; antes, ela
 * vazava a senha sem saber.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
