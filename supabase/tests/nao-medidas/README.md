# Baterias ainda não medidas

Bateria que vive aqui **nunca foi executada contra banco nenhum**.

`scripts/banco/suites-permitidas.txt` autoriza baterias por **valores
medidos** — sha256 do texto, erros esperados, asserções aprovadas e marcador
final. Só se mede executando. Uma bateria nova não tem esses valores, e
inventá-los anularia o sentido da lista: ela passaria a autorizar pelo texto,
que é exatamente o que ela existe para não fazer.

O validador recusa, com razão, qualquer bateria de `supabase/tests/` que não
esteja na lista. Por isso as não medidas ficam neste subdiretório, fora do
alcance do glob `supabase/tests/*.sql`.

## Como uma bateria sai daqui

1. o destino descartável autorizado está acessível;
2. a bateria roda por `scripts/banco/destino-autorizado.sh`;
3. os valores observados vão para `suites-permitidas.txt`;
4. o arquivo sobe um nível, para `supabase/tests/`.

Nessa ordem. Mover antes de medir só adianta a reprovação na CI.

## A saída mais curta: não precisar da lista

`suites-permitidas.txt` existe porque uma bateria que desliga `ON_ERROR_STOP`
relata por linha de texto e termina em código zero mesmo tendo falhado — quem
converte relatório em veredito é o validador, contra valores revisados.

Uma bateria que **não** desliga `ON_ERROR_STOP` não entra nesse arranjo e não
precisa de linha na lista. Para isso ela tem de:

- provocar todo erro de SQL esperado **dentro** de bloco `plpgsql` com
  `exception`, de modo que nenhum erro legítimo escape para o psql;
- levantar exceção no fim se qualquer asserção falhou, que é o que faz o psql
  terminar em código não zero;
- rodar com `-1`, para desfazer o que escreveu.

Foi a rota de `validation_documents_matriz.sql`, medida em 09/10/2026 contra
`simulacao` com 28 de 28 asserções aprovadas. É a rota preferível: o veredito
fica no próprio SQL, não num número que alguém mediu uma vez e copiou.
