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
