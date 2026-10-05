# Catálogo de carga — estado atual e evolução

Aço é a **primeira** vertical da SteelGo, não a única prevista. Este documento
registra o que o modelo expressa hoje, o que ele ainda não expressa, e como
evoluir sem reescrever os fretes existentes.

---

## 1. Dois conceitos que não podem ser confundidos

| Conceito | O que é | Existe hoje? |
|---|---|---|
| **Categoria da carga** | classificação **genérica**, válida para qualquer vertical: o que está sendo transportado, em termos amplos | **não** |
| **Tipo de aço** | classificação **específica da vertical de aço** | sim — `freights.steel_type` |

`freights.category` **não** é a categoria da carga. É o enum
`freight_category` (`traditional`, `green_low_carbon`, `green_ev`), que
classifica o frete por **emissão**, não a carga.

## 2. O que o modelo expressa hoje

- Uma única coluna carrega a classificação da carga: `freights.steel_type`,
  do enum `public.steel_type`, anulável.
- O enum é usado por **uma única coluna em todo o banco** — conferido em
  `information_schema.columns`. A dependência já está contida.
- O catálogo de apresentação vive em **um único arquivo**: `src/lib/steel.ts`.
  Os ids são exatamente os rótulos do enum, e a ligação é verificada em tempo
  de compilação por `satisfies readonly SteelTypeOption[]` sobre
  `Enums<"steel_type">`.

### Por que a trava de compilação existe

O catálogo e o enum já divergiram: a tela enviava `"plate"` e o banco só aceita
`"chapa_grossa"`. **Nenhum** dos oito tipos oferecidos existia no enum, e
publicar frete era impossível pela interface. Havia três cópias da lista —
`src/lib/steel.ts`, `NewFreightPage.tsx` e `OnboardingPage.tsx` — e nada que
obrigasse as três a concordar entre si ou com o banco.

Agora há uma cópia só, e ela não compila se divergir.

## 3. Suporte a outras cargas — o que foi procurado e o que foi encontrado

**Implementação não localizada nas referências examinadas.** Esta é a conclusão
possível com o alcance abaixo — não é uma afirmação de que nunca existiu
trabalho nesse sentido em outro lugar.

### Alcance da busca (2026-10-02)

| Onde | Quanto |
|---|---|
| Referências Git | **20** (9 branches remotas, mais locais e `HEAD`) |
| Migrations | **87**, todas as do repositório |
| Árvores de arquivo | `src/`, `supabase/`, `docs/` em cada referência |
| Histórico | `git log --all` por mensagem de commit |

| Termo procurado | Encontrado |
|---|---|
| `cargo_category`, `commodity`, `cargo_type` | nada |
| mensagens com `cargo`, `carga`, `vertical`, `commodity`, `granel`, `generic` | nada |
| migrations com `cargo`/`commodity`/`category` genérica | nada |
| `granel`, `conteiner`, `frigorific`, `carga geral`, `multimodal`, `agro`, `fertilizante` | nada |
| `container` (51 arquivos) e `cimento` (50) | **falsos positivos**: `ResponsiveContainer` do recharts e substring de `reconhecimento`/`abastecimento` |
| `alter type public.steel_type` | nada — o enum nasceu na primeira migration (`20260521014520`) com os mesmos 10 valores e nunca foi alterado |

**Fora do alcance:** repositórios que não este, branches não publicadas,
protótipos locais, documentos fora de `docs/` e qualquer material não versionado.
Se existir trabalho anterior em algum desses lugares, ele não foi examinado.

### Consequência prática, hoje

Com o que está no repositório, um frete de carga que não seja de aço não tem
como ser classificado.

`steel_type = outro` significa **"outro tipo de aço fora do catálogo"**. Não
significa, e não deve passar a significar, "carga que não é de aço". Usá-lo
assim destruiria a distinção da seção 1 e deixaria a vertical de aço sem como
separar o que é aço não catalogado do que não é aço.

**Aço é a primeira vertical da SteelGo** — recorte de produto, não defeito. A
plataforma poderá atender outros tipos de carga; a seção 4 descreve o caminho
compatível com os fretes já existentes.

## 4. Evolução futura, compatível com os fretes existentes

Proposta. **Nada disto foi feito agora** — a rodada atual corrigiu o catálogo da
vertical e nada mais.

1. **Acrescentar `freights.cargo_category`**, genérica e anulável, com um enum
   próprio (por exemplo `siderurgico`, `granel_solido`, `carga_geral`, ...).
   Anulável e sem default garante que nenhum frete existente precise ser
   reescrito.
2. **Retrocompatibilidade por leitura, não por migração de dados:** todo frete
   com `steel_type` preenchido é, por definição, da vertical de aço. A
   categoria pode ser derivada na leitura enquanto a coluna estiver nula. Nenhum
   `UPDATE` em massa, nenhuma janela de inconsistência.
3. **`steel_type` permanece a especialização da vertical de aço** e continua
   anulável. Para um frete de outra vertical, ele fica nulo — que é exatamente o
   que já significa hoje.
4. **Cada vertical nova traz a sua própria especialização**, em coluna ou tabela
   própria, e o seu próprio catálogo em um arquivo próprio, no mesmo padrão de
   `src/lib/steel.ts`: fonte única, amarrada ao enum em tempo de compilação.
5. **Regras genéricas não ganham dependência nova.** Frete, proposta, viagem e
   pagamento continuam tratando a classificação como texto opaco e usando a
   função de rótulo da vertical para exibir. Nenhuma delas deve comparar com
   valores literais do enum.

### O que NÃO fazer

- Reaproveitar `steel_type` como classificador genérico.
- Usar `outro` para carga não siderúrgica.
- Criar telas de outras verticais antes de existir o conceito genérico.
- Espalhar `Enums<"steel_type">` para fora de `src/lib/steel.ts`.

## 5. Decisão pendente registrada

O catálogo antigo oferecia **"Aço especial"** (ferramentas e moldes). Esse valor
**não existe** no enum `public.steel_type` e, portanto, nunca pôde ser gravado.
Ele **não** foi dobrado silenciosamente em `outro`: foi retirado da lista, e em
seu lugar passaram a aparecer os valores que o banco de fato aceita e que a tela
não oferecia — `barra_redonda`, `blank_estampagem` e `outro`.

Se "aço especial" for uma categoria comercial que importa, ela precisa de um
valor próprio no enum, por migração, em rodada própria. Fica como decisão.
