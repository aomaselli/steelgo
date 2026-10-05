# Publicação do aviso de privacidade — procedimento administrativo

O aceite de viagem rastreada depende de um aviso de privacidade vigente. Hoje
**nenhuma tela do produto publica esse aviso**: `rpcPublishPrivacyNotice` existe
em `src/lib/trips.ts` e nenhum `.tsx` a chama. Enquanto não houver tela, a
publicação é um ato administrativo, e precisa de procedimento — não de acesso
solto ao banco.

Tudo abaixo foi verificado lendo as funções no banco descartável da simulação,
que carrega as mesmas migrations do repositório. **Produção não foi acessada.**

---

## 1. O que o servidor já exige

`public.publish_privacy_notice(p_version, p_body_md, p_effective_from, p_url, p_request_id)`:

| Regra | Comportamento |
|---|---|
| Autorização | `require_steelgo_admin` — sessão autenticada **e** papel `admin`. Sem isso, `42501` |
| Versão | precisa casar `^[0-9]+(\.[0-9]+)*$`. `sim-v1` é recusado; `1.0` passa |
| Texto | mínimo 500 caracteres |
| Texto de rascunho | recusa se contiver `placeholder`, `lorem ipsum`, `rascunho`, `[a definir]` ou `TODO` |
| Integridade | grava `body_sha256` do texto |
| Idempotência | `p_request_id` (uuid) — repetir a mesma chamada devolve o mesmo resultado, não republica |
| Auditoria | grava linha em `trip_admin_actions` com ator, versão, sha256 e vigência |

Ou seja: a função já impede publicar rascunho, publicar sem papel e publicar em
duplicidade. O que ela **não** pode fazer é decidir o conteúdo e o momento.

## 2. A regra que mais importa: republicar invalida todo mundo

`get_my_driver_trip` calcula `acknowledged` comparando **versão e sha256
guardados no motorista** com os do aviso vigente:

```
acknowledged = drivers.privacy_notice_version  = aviso.version
           AND drivers.privacy_notice_sha256   = aviso.body_sha256
```

E `current_privacy_notice()` devolve o aviso com `effective_from <= now()` mais
recente.

**Consequência:** no instante em que um aviso novo entra em vigor, o aceite de
**todos** os motoristas deixa de valer — inclusive os que estão em viagem. Como
`tripTracker.start` exige `noticeAcknowledged`, o rastreamento desses motoristas
para até cada um reconhecer de novo, pelo celular, na estrada.

Nenhuma correção de texto, por menor que seja, é inócua: qualquer mudança no
corpo muda o sha256.

## 3. Procedimento

### 3.1 Papéis

| Papel | Responsabilidade |
|---|---|
| Jurídico / DPO | redige e aprova o texto; decide se a mudança é material |
| Operação | escolhe a janela de vigência e avisa a frota |
| Administrador SteelGo (papel `admin`) | executa a publicação |

Ninguém acumula redação e publicação. O papel `admin` é concedido
nominalmente, e a lista de quem o tem é revisada a cada publicação.

### 3.2 Passos

1. **Texto aprovado por escrito** pelo jurídico, com a versão proposta.
2. **Numeração**: `MAJOR.MINOR`. Mudança material (nova finalidade, novo dado,
   novo compartilhamento, retenção maior) incrementa `MAJOR`; correção de
   redação sem mudança de tratamento incrementa `MINOR`. **As duas invalidam o
   aceite** — a distinção serve ao aviso prévio, não à técnica.
3. **Vigência com antecedência**: `p_effective_from` **no futuro**, nunca `now()`.
   Mínimo sugerido: 7 dias corridos para mudança material, 48 h para correção de
   redação. Isso dá janela para os motoristas reconhecerem antes de o aviso
   antigo deixar de valer.
4. **Aviso à frota** antes da vigência, pelos canais já existentes, dizendo que
   haverá novo reconhecimento no aplicativo.
5. **Janela de execução**: fora do pico operacional. Não publicar com viagens em
   trânsito previstas para cruzar a vigência, quando der para evitar.
6. **Execução** com `p_request_id` gerado e **registrado antes** da chamada, para
   que uma repetição por falha de rede não republique.
7. **Conferência pós-publicação**: `current_privacy_notice()` devolve a versão
   esperada; `trip_admin_actions` tem a linha com ator, sha256 e vigência; a tela
   do motorista mostra a versão e o início da vigência.
8. **Acompanhamento**: medir a fração de motoristas com `privacy_notice_version`
   igual à vigente nas primeiras 48 h; quem não reconheceu não pode aceitar
   viagem, e isso é consequência operacional, não bug.

### 3.3 Enquanto não houver tela

A publicação é feita por quem tem papel `admin`, pela RPC, com os passos acima,
e **com registro escrito** do texto aprovado, da versão, do `request_id` e de
quem executou. O resto é auditado pelo próprio banco (`trip_admin_actions`,
`rpc_call_log`).

### 3.4 Tela mínima recomendada

Uma tela administrativa pequena resolve o grosso do risco: campo de versão com a
máscara validada, corpo em markdown com contagem de caracteres, seletor de
vigência **que recusa data passada**, pré-visualização do que o motorista verá,
`request_id` gerado pela própria tela, e confirmação em duas etapas mostrando
quantos motoristas perderão o aceite. Estimativa: uma tela, sem migration,
reaproveitando `rpcPublishPrivacyNotice`.

---

## 4. Passos restantes para o piloto real, com critério de aprovação

| # | Passo | Critério de aprovação |
|---|---|---|
| 1 | Aviso de privacidade real publicado | `current_privacy_notice()` devolve versão aprovada pelo jurídico, vigência no futuro no momento da publicação, linha correspondente em `trip_admin_actions` |
| 2 | Tela administrativa de publicação | publicar e conferir pela tela, sem SQL manual, incluindo a recusa de data passada e de texto com marcador de rascunho |
| 3 | Assinatura de contrato pela interface | duas assinaturas registradas **pela tela**, com `signature_url` em `https` servida pelo Storage, contrato em `active` e frete em `contracted` — sem nenhuma chamada direta à RPC |
| 4 | Identificação das partes no contrato | embarcador e transportadora veem nome da contraparte e o motorista; documento invisível aparece como invisível, nunca como "—" |
| 5 | Viagem em aparelho real | um ciclo completo com GPS e câmera de celular, incluindo app em segundo plano e perda de rede, com a fila offline drenando ao voltar |
| 6 | Pedágio | provedor contratado, credenciais fora do navegador, e **um corredor** conferido contra tarifa oficial em pelo menos 3 rotas; `CORRIDOR_COVERAGE` só recebe `verified_at` depois disso |
| 7 | Pagamento | provedor definido, ou procedimento manual escrito com comprovante e prazo, já que a tela declara "Sem provedor de pagamento integrado" |
| 8 | Mapa | `VITE_GOOGLE_MAPS_KEY` configurada; trilha visível para transportadora e embarcador |
| 9 | Backup e recuperação | ensaio de restauração repetido com o esquema atual, com as 9 limitações já registradas revisadas |
| 10 | Revogação de acesso | conferir no ambiente remoto o achado de permissões em `freight_quotes` (hoje verificado só localmente) |

**Critério de entrada do piloto:** passos 1, 3, 4, 5 e 7 aprovados. Pedágio
(passo 6) **não** é bloqueante para o piloto — o serviço recusa cotação sem
cobertura verificada, e a operação roda sem ele.

**Critério de parada do piloto:** qualquer entrega sem comprovante registrado,
qualquer viagem com rastreamento interrompido sem explicação, ou qualquer
divergência entre valor cobrado e valor contratado.
