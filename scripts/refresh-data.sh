#!/usr/bin/env bash
# Re-download the open-data sources and rebuild every data/*.json.
# The built JSON under data/ is what ships in the image; raw/ is gitignored.
#   bash scripts/refresh-data.sh            # RNE + OFGL + cumul + finances
#   WITH_HATVP=1 bash scripts/refresh-data.sh   # also refresh HATVP (84MB XML)
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=pipeline/raw
mkdir -p "$RAW"

RNE=https://static.data.gouv.fr/resources/repertoire-national-des-elus-1
echo "· RNE maires + cross-reference registers"
curl -sSL "$RNE/20260505-152119/elus-maires-mai.csv"                        -o "$RAW/elus-maires-mai.csv"
curl -sSL "$RNE/20260505-152059/elus-deputes-dep.csv"                       -o "$RAW/rne-deputes.csv"
curl -sSL "$RNE/20260505-152040/elus-senateurs-sen.csv"                     -o "$RAW/rne-senateurs.csv"
curl -sSL "$RNE/20260505-151941/elus-conseillers-departementaux-cd.csv"     -o "$RAW/rne-cd.csv"
curl -sSL "$RNE/20260505-151954/elus-conseillers-regionaux-cr.csv"          -o "$RAW/rne-cr.csv"
curl -sSL "$RNE/20260505-152023/elus-representant-parlement-europeen-rpe.csv" -o "$RAW/rne-rpe.csv"
curl -sSL "$RNE/20260505-151923/elus-conseillers-communautaires-epci.csv"   -o "$RAW/rne-epci.csv"

echo "· OFGL commune finances (bulk export, ~700MB uncompressed)"
URL=$(python3 scripts/fetch_ofgl.py)
curl -sSL "$URL" -o "$RAW/ofgl-communes.csv"

if [ "${WITH_HATVP:-0}" = "1" ]; then
  echo "· HATVP déclarations (HTTP/1.1)"
  curl -sSL --http1.1 "https://www.hatvp.fr/livraison/merge/declarations.xml" -o "$RAW/declarations.xml"
fi

echo "· build"
python3 pipeline/build_rne.py
python3 pipeline/build_finances.py
python3 pipeline/build_cumul.py
[ -f "$RAW/declarations.xml" ] && python3 pipeline/build_hatvp.py || echo "  (skip HATVP — no declarations.xml)"
echo "✓ data rebuilt"
