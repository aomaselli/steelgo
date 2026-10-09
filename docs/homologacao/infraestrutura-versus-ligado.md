# Infraestrutura homologada ≠ funcionalidade ligada

Medido em 09/10/2026 contra o destino descartável autorizado `simulacao`
(`fcgsint1001`, cluster `7691806784564547622`).

Este documento existe porque "homologado" e "pronto" soam parecidos e não são a
mesma coisa. Abaixo, o que foi medido e o que **não existe ainda**.

## O levantamento, não a impressão

```
grep -rn "server/documents" src/ --include=*.ts --include=*.tsx | grep -v src/server/documents/
  → nenhuma linha

grep -rn "validation-documents" src/ --include=*.ts --include=*.tsx
  → nenhuma linha

grep -rn "driver-verification.fn|verifyDriverFn" src/ | grep -v src/server/verification/
  → nenhuma linha
```

Nenhum arquivo fora dos próprios módulos os referencia.

## Quadro

| Camada | #12 verificação | #13 documentos | #14 semântica Datavalid |
|---|---|---|---|
| Lógica pura, testada | sim | sim | sim |
| Esquema no banco | — | **sim, exercitado** | — |
| Policies de RLS e de bucket | — | **sim, exercitadas** | — |
| Medido contra serviço real | — | **Storage local** | — |
| Chamado por tela | **não** | **não** | **não** |
| Chamado por rota ou RPC | **não** | **não** | **não** |
| Job agendado | — | **não existe** | — |
| Fornecedor real homologado | **não** | — | **não** |

## O que está homologado

**#13 — infraestrutura e lógica.** Bucket privado, cinco tabelas, RLS,
policies de caminho, trilha append-only, amarra do ator de sistema, política de
retenção que nasce sem prazo. Bateria de banco: 31 de 31. Expurgo integrado
contra o Storage de verdade, com falha e nova tentativa: 19 de 19. URL assinada:
11 de 11. Módulo em TypeScript: 33 de 33.

**#12 e #14 — lógica pura.** Motor de regras com blocos separados, proteção
contra provider simulado em modo real, semântica dos quatro tipos de resultado
do Datavalid, política de retry por fase de envio. Nenhum fornecedor real
homologado: a GCC continua simulada, e `sandbox`/`production` recusam
inicializar por isso.

## O que não existe

- tela de envio de CNH e selfie;
- tela de consentimento, nem publicação do texto vigente;
- rota ou RPC que emita URL assinada aplicando a matriz de `access.ts`;
- job agendado que rode o expurgo — `expurgarLote` existe e ninguém a chama;
- revisão administrativa: a policy de admin existe no banco, a tela não;
- qualquer caminho que leve documento real a sair do aparelho de alguém.

`verifyDriverFn` é `createServerFn` e nenhuma tela a invoca. O expurgo roda
hoje só pelo harness de homologação.

## URL assinada é credencial, não consulta autorizada

A matriz de acesso decide **quem obtém** uma URL. Ela não decide **quem usa** a
URL depois de emitida. Medido em
`scripts/homologacao/url-assinada-como-credencial.mjs`:

| Depois de… | A URL já emitida |
|---|---|
| retirar o consentimento no banco | **continua servindo** (HTTP 200) |
| apagar o registro em `validation_documents` | **continua servindo** (HTTP 200) |
| apagar o objeto pela Storage API | para de servir (HTTP 400) |

O token é um JWT `HS256` assinado pelo segredo do projeto, com corpo
`url, scope, iat, exp`. **Não há `jti`** — sem identificador não existe lista de
revogados, e portanto não existe revogação por URL.

As três consequências práticas:

1. **Revogar é apagar o objeto.** É a única revogação ao alcance de uma
   operação. Trocar o segredo do projeto invalidaria todas as URLs de todos os
   buckets, e derrubaria a aplicação junto.
2. **O teto de validade é o controle principal.** São 120 s em
   `TTL_MAXIMO_SEGUNDOS`, com 60 s de padrão, e pedido acima do teto é erro, não
   ajuste silencioso. A janela de exposição de um vazamento é essa.
3. **URL assinada nunca entra em log, trilha ou mensagem.** Já é barreira:
   `buildDocumentAuditEvent` recusa o evento que contenha `?token=`,
   `?signature=`, `https://` ou JWT. Vale para log de aplicação, log de proxy,
   histórico de navegador e cópia de mensagem — todos fora do nosso controle.

Um quarto ponto, que ainda não tem solução: **retirada de consentimento não
alcança URL já emitida**. Hoje a mitigação é só o teto de 120 s. Alcançar de
verdade exigiria servir o documento por rota própria, que revalida a matriz a
cada leitura, em vez de entregar credencial do Storage ao cliente. É a decisão
de desenho que a tela de revisão administrativa vai obrigar a tomar, e ela não
deve ser tomada por omissão.

## Para sair daqui

Na ordem em que as barreiras se sustentam:

1. rota que emite a URL aplicando `authorizeDocumentAccess`, registrando
   `access` na trilha — sem a URL;
2. tela de consentimento, com o texto vigente e o sha256 do corpo;
3. tela de envio, gravando por caminho `<finalidade>/<titular>/<espécie>-<id>`;
4. job de expurgo, que **só roda com prazo aprovado** — `avaliarExpurgo` lança
   enquanto o prazo for nulo, e isso é proteção, não pendência;
5. revisão administrativa, e com ela a decisão sobre servir por rota própria.

Nada disso deve sair do destino descartável antes de prazo de retenção
aprovado pelo jurídico. Documento real segue bloqueado.
