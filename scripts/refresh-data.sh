#!/usr/bin/env bash
# Re-fetch the open-data sources and rebuild every data/*.json.
# The built JSON under data/ is what the container serves; pipeline/raw/ is gitignored.
#
# Inputs come from Sluice (the fleet's open-data gateway), which refreshes every
# source daily, keeps the previous versions, and serves byte-identical files. The
# 700 MB OFGL export is only re-downloaded when its dataset actually changes —
# Sluice probes the catalogue's data_processed first. Catalogue lives in
# scripts/sluice-sources.json; scripts/fetch_ofgl.py + fetch_decp.py remain the
# generators for those export URLs.
#
#   bash scripts/refresh-data.sh                 # RNE + OFGL + cumul + finances + DECP
#   WITH_HATVP=1 bash scripts/refresh-data.sh    # also refresh HATVP (84 MB XML)
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/sluice.sh
source scripts/sluice.sh
RAW=pipeline/raw
mkdir -p "$RAW"

echo "· RNE maires + cross-reference registers"
sluice_get fr-rne-maires                            "$RAW/elus-maires-mai.csv"
sluice_get fr-rne-deputes                           "$RAW/rne-deputes.csv"
sluice_get fr-rne-senateurs                         "$RAW/rne-senateurs.csv"
sluice_get fr-rne-conseillers-departementaux        "$RAW/rne-cd.csv"
sluice_get fr-rne-conseillers-regionaux             "$RAW/rne-cr.csv"
sluice_get fr-rne-representants-parlement-europeen  "$RAW/rne-rpe.csv"
sluice_get fr-rne-conseillers-communautaires        "$RAW/rne-epci.csv"
# full municipal-council register (published on its own cadence)
sluice_get fr-rne-conseillers-municipaux            "$RAW/elus-conseillers-municipaux.csv"

echo "· OFGL commune finances (bulk export, ~700 MB uncompressed)"
sluice_get fr-ofgl-communes "$RAW/ofgl-communes.csv"

echo "· DECP v2 — commande publique (marchés + name map + commune SIREN directory)"
sluice_get fr-decp-marches         "$RAW/decp-marches.csv"
sluice_get fr-decp-noms-titulaires "$RAW/decp-names.csv"
sluice_get fr-ofgl-communes-siren  "$RAW/ofgl-siren.csv"

echo "· BANATIC — EPCI à fiscalité propre de rattachement (périmètre)"
sluice_get fr-banatic-perimetre "$RAW/banatic-perimetre.csv"

echo "· mandate history — archived RNE snapshot of the 2020-2026 term"
sluice_get fr-rne-maires-2020-2026 "$RAW/elus-maires-2020-2026.csv.gz"

if [ "${WITH_HATVP:-0}" = "1" ]; then
  echo "· HATVP déclarations"
  sluice_get fr-hatvp-declarations "$RAW/declarations.xml"
fi

echo "· résultats municipales 2026 — per-commune (tour 1 + tour 2)"
sluice_get fr-municipales-2026-t1 "$RAW/muni2026-communes-t1.csv"
sluice_get fr-municipales-2026-t2 "$RAW/muni2026-communes-t2.csv"

echo "· commune centroids (lon/lat) for the comparateur radius scope"
sluice_get fr-communes-centres "$RAW/communes-centres.json"

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
