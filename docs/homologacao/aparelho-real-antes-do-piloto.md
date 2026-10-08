# Requisito: homologação em aparelho real antes da viagem piloto

**Bloqueia:** primeira viagem piloto com motorista real.
**Não bloqueia:** a publicação do PR #4 nem da migration `20261008120000`.
**Origem:** rodada de validação funcional do PR #4, 08/10/2026.

## Por que isto é requisito, e não recomendação

Os três comportamentos abaixo foram exercitados em navegador, com
**geolocalização sintética** — `navigator.geolocation` substituído na página por
uma posição fixa (Ipatinga/MG, ±10 m). Isso prova a lógica do aplicativo e as
recusas do servidor, e **não prova** nada sobre o aparelho: não há GPS, não há
diálogo de permissão do sistema, não há variação de precisão, não há suspensão
em segundo plano, não há perda e retomada de sinal.

Dois limites concretos observados no ambiente de teste, que só o aparelho
resolve:

- o `watch` sintético não renovava `last` no rastreador; um fix com mais de
  60 s fazia `captureOnce({reason: "command"})` cair numa leitura que o painel
  do navegador não serve;
- o painel do navegador roda com `document.visibilityState === "hidden"`, o que
  por si só altera o comportamento do rastreador e das repetições de consulta.

## 1. Atualização do aviso de privacidade durante viagem em curso

**O que se viu na instância descartável.** O aviso foi republicado (0.4) com a
viagem já em `en_route_to_pickup`; o motorista tinha reconhecido a 0.3 e a
sessão de rastreamento registrava a 0.1. O rastreador parou — corretamente — e,
antes da correção em `f8e7289`, a viagem ficava travada com
`Comando recusado (location_required)` e sem caminho para reconhecer a versão
nova.

**Testar no aparelho:**

1. Viagem em curso, rastreamento ativo, aviso vigente reconhecido.
2. Publicar uma versão nova do aviso enquanto a viagem corre.
3. Com o aplicativo em segundo plano e depois voltando ao primeiro plano,
   tocar a próxima etapa.

**Aceitação:**
- a tela abre o aviso novo em vez de enfileirar comando;
- nenhum comando sem posição entra na fila;
- após reconhecer, o rastreamento volta sozinho e a etapa é registrada;
- a sessão de rastreamento passa a registrar a versão nova.

## 2. Renovação de localização

**O que ainda não se sabe.** Se o `watch` do aparelho mantém `last` fresco o
bastante para a janela de 60 s de `captureOnce({reason: "command"})`, com o
aplicativo em primeiro plano, em segundo plano e depois de retomado.

**Testar no aparelho:**

1. Parado em ambiente fechado (precisão ruim) e a céu aberto.
2. Aplicativo em primeiro plano; depois minimizado por 2, 5 e 15 minutos; depois
   retomado.
3. Em movimento, e com o rádio desligado e religado.

**Aceitação:**
- em cada retomada, a etapa seguinte é aceita sem `location_required`;
- quando a posição realmente falta, aparece a mensagem nova
  ("Sem localização do aparelho…") e **nenhum comando é enfileirado**;
- a precisão registrada corresponde à do aparelho, e a política de rejeição por
  precisão (`accuracy_reject_m`) é exercida ao menos uma vez.

## 3. Os dois botões de precisão

**Achado de leitura de código, ainda não confirmado em aparelho.** Em
`src/components/trip/DriverCapture.tsx`, no passo de GPS, **"Continuar" e "Usar
mesmo assim (fica registrado como baixa precisão)" chamam o mesmo `onNext`**. O
segundo botão não registra nada de diferente; a posição enviada vem depois, de
`getCommandPosition()`, e não da leitura mostrada na tela.

Em consequência, no ambiente de teste a tentativa por "Usar mesmo assim"
terminou em `location_required` — o botão promete registro com baixa precisão e
não entrega.

**Testar no aparelho**, nas telas que usam esse passo (checkpoint de carga,
comprovante de entrega, ocorrência, recibo de retorno):

1. Com precisão boa: "Continuar".
2. Com precisão ruim (ambiente fechado), acima do limite que desabilita
   "Continuar": "Usar mesmo assim".

**Aceitação:**
- "Usar mesmo assim" **ou** registra de fato, com a precisão ruim gravada e
  visível para as partes, **ou** é retirado da tela;
- em nenhum caso ele leva a `location_required` sem explicação.

> Este item provavelmente exige mudança de código. Ficou **fora** do escopo do
> PR #4: só consegui estabelecer o comportamento por leitura e por um ambiente
> que não serve geolocalização, e corrigir sem poder medir seria adivinhar.

## Escopo

Nada aqui bloqueia a publicação do PR #4 nem da migration `20261008120000`. O
que estes testes bloqueiam é a **viagem piloto com motorista real**.
