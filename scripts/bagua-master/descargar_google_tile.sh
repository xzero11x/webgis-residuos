#!/bin/sh
# Desde la raíz del repositorio: sh scripts/bagua-master/descargar_google_tile.sh
cd "$(dirname "$0")/../../data/bagua-master/complemento/crudo" || exit 1
# Descarga por rangos en paralelo (8 partes) del tile 91b de Google Open Buildings v3 y lo une.
URL=https://storage.googleapis.com/open-buildings-data/v3/polygons_s2_level_4_gzip/91b_buildings.csv.gz
SIZE=491524995
N=8
CH=$(( (SIZE + N - 1) / N ))
mkdir -p parts
i=0
while [ $i -lt $N ]; do
  s=$(( i * CH )); e=$(( s + CH - 1 )); [ $e -ge $SIZE ] && e=$(( SIZE - 1 ))
  (curl -s -L -A x --retry 8 -r $s-$e "$URL" -o parts/p$i.bin) &
  i=$(( i + 1 ))
done
wait
cat parts/p0.bin parts/p1.bin parts/p2.bin parts/p3.bin parts/p4.bin parts/p5.bin parts/p6.bin parts/p7.bin > google_91b_buildings.csv.gz.tmp
ACT=$(wc -c < google_91b_buildings.csv.gz.tmp)
if [ "$ACT" -eq "$SIZE" ] && gzip -t google_91b_buildings.csv.gz.tmp; then mv google_91b_buildings.csv.gz.tmp google_91b_buildings.csv.gz && echo OK; else echo "FALLO tamaño=$ACT"; fi
