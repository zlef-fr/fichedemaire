#!/usr/bin/env python3
"""
EPCI de rattachement — intercommunalité à fiscalité propre of every commune.

BANATIC's bulk "périmètre" file (data.gouv, Licence Ouverte) lists, for each
EPCI à fiscalité propre (CC / CA / CU / métropole), its member communes. Every
commune belongs to exactly one such EPCI, so this gives a full-coverage
"intercommunalité de rattachement" line for all 34k communes — the arena the
mayor sits in ex officio, even when they hold no président/VP function (those
are already surfaced from the RNE in cumul.json).

NOTE: the bulk file covers EPCI à fiscalité propre ONLY. The ~8,500 syndicats
(SIVU / SIVOM / syndicats mixtes) a commune may also belong to are NOT in the
bulk open data — that mapping lives only in BANATIC's per-département exports.
So syndicat membership is deliberately out of scope here.

Source file (data.gouv resource, ISO-8859-1, ';'-delimited):
  dept;siren;raison_sociale;nature_juridique;mode_financ;nb_membres;
  total_pop_tot;total_pop_mun;dep_com;insee;siren_membre;nom_membre;…

Output: data/epci.json  →  { "<insee>": {nom, nature, natureLabel, siren} }
"""
import csv, json, os, sys

HERE = os.path.dirname(__file__)
RAW = os.path.join(HERE, "raw")
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAW, "banatic-perimetre.csv")

# BANATIC nature codes → readable French labels
NATURE = {
    "CC": "Communauté de communes",
    "CA": "Communauté d'agglomération",
    "CU": "Communauté urbaine",
    "METRO": "Métropole",
    "MET69": "Métropole de Lyon",
    "EPT": "Établissement public territorial",
}

out = {}
with open(SRC, encoding="latin-1", newline="") as f:
    for row in csv.DictReader(f, delimiter=";"):
        insee = (row.get("insee") or "").strip()
        nom = (row.get("raison_sociale") or "").strip()
        nat = (row.get("nature_juridique") or "").strip()
        if not insee or not nom:
            continue
        out[insee] = {
            "nom": nom,
            "nature": nat,
            "natureLabel": NATURE.get(nat, nat),
            "siren": (row.get("siren") or "").strip(),
        }

json.dump(out, open(os.path.join(DATA, "epci.json"), "w"),
          ensure_ascii=False, separators=(",", ":"))
print("✓ epci.json — %d communes rattachées à un EPCI à fiscalité propre" % len(out),
      file=sys.stderr)
