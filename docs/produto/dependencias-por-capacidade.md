# Dependências externas, por capacidade

Complemento de [`validacao-documental-desenho-minimo.md`](./validacao-documental-desenho-minimo.md).

Este documento existe porque a lista anterior tratava SERPRO, SENATRAN, GCC e
prova de vida como **pré-requisitos universais**, todos bloqueando tudo. Não
são. Cada um entrega uma **capacidade** diferente, e algumas podem já estar
cobertas pelo contrato que existir — ou nem ser necessárias.

> **CORRIGIDO EM 09/10/2026, pela documentação oficial.** A versão anterior
> deste documento continha um erro factual: tratava a GCC como alternativa a
> um registro próprio de consentimento. Não é. Ver
> [`datavalid-v5-matriz-capacidades.md`](./datavalid-v5-matriz-capacidades.md),
> que é a referência a partir de agora; este arquivo ficou como mapa das
> capacidades e das que seguem fora do Datavalid.
>
> **O que aqui é análise e o que é fato.** O código deste repositório é fato e
> está citado. O que o contrato do Datavalid V5 efetivamente cobre **não é fato
> conhecido por este documento** — ninguém aqui leu o contrato. Toda linha
> marcada *a confirmar* precisa de resposta do fornecedor ou do contrato antes
> de virar plano. Decidir com base numa suposição sobre cobertura contratual é
> exatamente o erro que este documento quer evitar.

---

## 1. As capacidades, uma a uma

| | Capacidade | Para que serve | Bloco |
|---|---|---|---|
| C1 | Autorização para consultar a base | permitir a consulta a cada requisição | A |
| C2 | Conferência de dados cadastrais da pessoa | nome, nascimento, situação do CPF | A |
| C3 | Comparação biométrica facial | a selfie é da pessoa do documento | A |
| C4 | Prova de vida (*liveness*) | a selfie é de uma pessoa presente, não de uma foto | A |
| C5 | Situação da CNH na fonte | habilitação válida, categoria, restrições | B |
| C6 | Situação do RNTRC | transportadora pode levar carga de terceiro | C |
| C7 | Situação do veículo | placa regular, CRLV | D |
| C8 | Vigência e cobertura da apólice | carga coberta | E |

São oito capacidades, não oito fornecedores. Um fornecedor pode entregar
várias; uma capacidade pode ter mais de uma fonte possível.

---

## 2. O que o Datavalid V5 cobre — a pergunta que precisa de resposta

O código assume três coisas, escritas em
`src/server/verification/providers/datavalid.provider.ts`:

> *Datavalid V5 exige credenciamento SENATRAN; a SteelGo contrata o SERPRO;
> antes de CADA requisição, uma autorização precisa ser obtida da GCC.*

Essas três linhas vieram de um levantamento anterior e **não foram conferidas
contra o contrato**. Cada uma muda o plano se estiver errada.

### Perguntas a levar ao fornecedor

| # | Pergunta | Se a resposta for SIM | Se for NÃO |
|---|---|---|---|
| ~~Q1~~ | ~~O contrato inclui o módulo de validação de CNH?~~ **RESPONDIDA:** os campos de CNH estão no endpoint unificado, sem contrato separado. **Mas respondem por COMPARAÇÃO** — ver B3 na matriz; a cobertura não se encerra | — | — |
| Q2 | O contrato inclui **biometria facial**? | C3 coberta | C3 precisa de outro fornecedor, e o bloco A fica incompleto |
| ~~Q3~~ | ~~O Datavalid oferece prova de vida?~~ **RESPONDIDA: sim.** `biometria_facial.vivacidade = true`. **Nenhum fornecedor adicional é necessário** | — | — |
| ~~Q4~~ | ~~A autorização por requisição (C1) é contratual, ou basta o nosso registro?~~ **RESPONDIDA: é obrigatória.** Portaria SENATRAN nº 139/2025; a GCC é entidade credenciada que registra, gerencia e audita os eventos de consentimento e ciência. Nosso registro interno **não substitui** | — | — |
| Q5 | O credenciamento SENATRAN é exigido para **qual** módulo — identidade, CNH, ou ambos? | define o que destrava primeiro | — |

**Q1 e Q3 são as que mais mudam o cronograma.** Q1 pode eliminar um contrato
inteiro; Q3 pode acrescentar um.

---

## 3. Mapa de capacidade → fonte → estado

| Capacidade | Fonte possível | Estado no código | Bloqueia |
|---|---|---|---|
| C1 autorização | **GCC credenciada pela SENATRAN — obrigatória, sem alternativa** | `FakeGCCProvider` embutido — **a fábrica recusa subir em modo real por causa dele** | A |
| C2 cadastrais | Datavalid V5 | `DatavalidSerproProvider` é stub que recusa com `DATAVALID_NOT_IMPLEMENTED` | A |
| C3 facial | Datavalid V5 *(Q2)* | idem C2 | A |
| C4 prova de vida | **Datavalid V5** — `vivacidade: true` | não implementado; **não é lacuna de fornecedor** | A |
| C5 CNH | Datavalid V5, **por comparação** | `senatran: null`; o motor trata ausência como inconclusivo. **B3 em aberto** | B |
| C6 RNTRC | ANTT — canal indefinido | `carriers.antt_rntrc` é texto digitado, nada confere | C |
| C7 veículo | indefinido | `trucks.plate` é texto digitado | D |
| C8 apólice | seguradora; conferência manual é aceitável no início | `carriers.insurance_expiry`, `rctr_c_active`; PDF enviado, não conferido | E |

---

## 4. O que isso muda no caminho crítico

**C1 é o bloqueio real de hoje, não o Datavalid.** A fábrica não inicializa em
`sandbox` nem em `production` enquanto a GCC for um fake — por desenho, desde
esta alteração. Implementar o Datavalid real não destrava nada sozinho: sem C1,
o módulo nem sobe; e se subisse, aprovaria com autorização inventada.

**C5 pode não precisar de contrato novo.** Se Q1 for sim, o bloco B se resolve
dentro do mesmo contrato do Datavalid. Se for não, é um contrato a mais no
caminho crítico — e até lá a habilitação fica **inconclusiva**, que é o
comportamento correto e já implementado, em vez de ser pulada em silêncio.

**C4 deixou de ser lacuna.** A prova de vida está no próprio Datavalid V5,
pelo atributo `vivacidade` no objeto `biometria_facial`. O que resta é
captura conforme os requisitos do fornecedor — não contratação.

**A lacuna que sobrou é B3, e é de outra natureza:** não falta fornecedor,
falta um retorno que diga a situação atual da habilitação. Ver a matriz.

**C6, C7 e C8 não bloqueiam A nem B.** São os blocos C, D e E, da etapa 4, e
começar manual com registro é melhor do que esperar automação.

---

## 5. Ordem que as respostas destravam

Q1, Q3 e Q4 estão respondidas pela documentação. O que destrava agora:

1. **Contrato com uma GCC credenciada** — é o bloqueio real, e não tem
   alternativa interna.
2. **Endereço do template** — três variantes divergentes entre webinar, guia
   e Swagger. Conferir a especificação oficial do ambiente contratado.
3. **B3** — decidir se a sondagem de `situacao` por comparação atende, ou se
   é preciso outra fonte para situação atual da habilitação.

Nada disso bloqueia a **Etapa 1** (storage privado, acesso auditado,
consentimento versionado, retenção), que não depende de fornecedor nenhum e é
pré-requisito de tocar em documento real.
