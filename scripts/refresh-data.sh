#!/usr/bin/env bash
# Re-download the open-data sources and rebuild every data/*.json.
# The built JSON under data/ is what ships in the image; raw/ is gitignored.
#   bash scripts/refresh-data.sh            # RNE + OFGL + cumul + finances + DECP
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
# full municipal-council register (published on its own cadence, distinct timestamp)
curl -sSL "https://static.data.gouv.fr/resources/repertoire-national-des-elus-1/20260609-130245/elus-conseillers-municipaux-cm.csv" -o "$RAW/elus-conseillers-municipaux.csv"

echo "· OFGL commune finances (bulk export, ~700MB uncompressed)"
URL=$(python3 scripts/fetch_ofgl.py)
curl -sSL "$URL" -o "$RAW/ofgl-communes.csv"

echo "· DECP v2 — commande publique (marchés + name map + commune SIREN directory)"
curl -sSL "$(python3 scripts/fetch_decp.py marches)" -o "$RAW/decp-marches.csv"
curl -sSL "$(python3 scripts/fetch_decp.py names)"   -o "$RAW/decp-names.csv"
curl -sSL "$(python3 scripts/fetch_decp.py siren)"   -o "$RAW/ofgl-siren.csv"

echo "· BANATIC — EPCI à fiscalité propre de rattachement (périmètre, data.gouv)"
# Bulk perimeter of EPCI à fiscalité propre (CC/CA/CU/métropole): one row per
# (EPCI, commune membre). Full national coverage. NOTE: the bulk file covers
# EPCI-FP only — syndicats (SIVU/SIVOM/SM) are not in the open bulk download.
curl -sSL "https://www.data.gouv.fr/api/1/datasets/r/6e05c448-62cc-4470-aa0f-4f31adea0bc4" \
  -o "$RAW/banatic-perimetre.csv"

echo "· mandate history — archived RNE snapshot of the 2020-2026 term (Internet Archive)"
# The live RNE only holds the current term; this Wayback capture is the 2020-2026
# elus-maires, used to detect renewals + the previous mayor. Stable historical file.
curl -sSL "http://web.archive.org/web/20250628120000id_/https://www.data.gouv.fr/fr/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503" \
  -o "$RAW/elus-maires-2020-2026.csv.gz"

if [ "${WITH_HATVP:-0}" = "1" ]; then
  echo "· HATVP déclarations (HTTP/1.1)"
  curl -sSL --http1.1 "https://www.hatvp.fr/livraison/merge/declarations.xml" -o "$RAW/declarations.xml"
fi

echo "· résultats municipales 2026 — per-commune (tour 1 + tour 2), Min. Intérieur"
curl -sSL "https://static.data.gouv.fr/resources/elections-municipales-2026-resultats-du-premier-tour/20260320-164339/municipales-2026-resultats-communes-2026-03-20.csv" -o "$RAW/muni2026-communes-t1.csv"
curl -sSL "https://static.data.gouv.fr/resources/elections-municipales-2026-resultats-du-scond-tour/20260323-180124/municipales-2026-resultats-communes-2026-03-23-16h14.csv" -o "$RAW/muni2026-communes-t2.csv"

echo "· commune centroids (lon/lat) for the comparateur radius scope"
curl -sSL "https://geo.api.gouv.fr/communes?fields=code,centre&format=json" -o "$RAW/communes-centres.json"

echo "· build"
python3 pipeline/build_rne.py
python3 pipeline/build_finances.py
python3 pipeline/build_cumul.py
python3 pipeline/build_epci.py
python3 pipeline/build_decp.py
python3 pipeline/build_council.py            # composition du conseil municipal (all communes)
python3 pipeline/build_elections.py          # participation + liste en tête (municipales 2026)
python3 pipeline/build_history.py            # 2020-2026 holder + renewal (all communes)
python3 pipeline/build_history_wikidata.py   # best-effort 2014-2020 holder + deeper tenure
[ -f "$RAW/declarations.xml" ] && python3 pipeline/build_hatvp.py || echo "  (skip HATVP — no declarations.xml)"
node pipeline/build_similar.js             # compact feature index for the comparateur (reads built data/)
echo "✓ data rebuilt"
