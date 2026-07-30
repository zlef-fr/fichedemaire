#!/usr/bin/env python3
"""
Composition du conseil municipal — from the RNE « conseillers municipaux »
register (elus-conseillers-municipaux.csv).

For every commune we aggregate the elected council installed after the March
2026 municipal election into a compact, factual summary:
  · taille du conseil (nombre d'élus)
  · femmes / hommes + part de femmes
  · âge : moyenne, min, max (100 % des élus ont une date de naissance)
  · nombre d'adjoint·e·s au maire

The register carries one row per councillor, INSEE-keyed by « Code de la
commune » (RNE drops the leading zero for depts 1–9 → zfill(5) to match the
mayor index). Near-total coverage: every commune's council is registered.

Output: data/council.json  →  { "<insee>": {size,women,men,womenPct,ageAvg,ageMin,ageMax,adjoints} }
Source: data.gouv.fr — Répertoire national des élus (licence Ouverte).
"""
import csv, json, os, re, sys, unicodedata
from datetime import date

HERE = os.path.dirname(__file__)
RAW = os.path.join(HERE, "raw")
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))
# Build reference date: real "today" so ages/seniority stay correct on the daily
# rebuild. FICHE_BUILD_DATE=YYYY-MM-DD pins it for a reproducible build.
TODAY = date.fromisoformat(os.environ["FICHE_BUILD_DATE"]) if os.environ.get("FICHE_BUILD_DATE") else date.today()

SRC = os.path.join(RAW, "elus-conseillers-municipaux.csv")


def parse_iso(s):
    s = (s or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def age_at(born, ref):
    if not born:
        return None
    return ref.year - born.year - ((ref.month, ref.day) < (born.month, born.day))


# insee -> aggregation accumulator
acc = {}
rows = 0
with open(SRC, encoding="utf-8") as f:
    for row in csv.DictReader(f, delimiter=";"):
        insee = (row.get("Code de la commune") or "").strip()
        if not insee:
            continue
        insee = insee.zfill(5)
        rows += 1
        a = acc.get(insee)
        if a is None:
            a = acc[insee] = {"size": 0, "women": 0, "men": 0, "adjoints": 0, "ages": []}
        a["size"] += 1
        sexe = (row.get("Code sexe") or "").strip().upper()
        if sexe == "F":
            a["women"] += 1
        elif sexe == "M":
            a["men"] += 1
        fonc = (row.get("Libellé de la fonction") or "").strip().lower()
        if "adjoint" in fonc:
            a["adjoints"] += 1
        age = age_at(parse_iso(row.get("Date de naissance")), TODAY)
        if age is not None and 15 <= age <= 110:
            a["ages"].append(age)

out = {}
for insee, a in acc.items():
    ages = a["ages"]
    rec = {
        "size": a["size"],
        "women": a["women"],
        "men": a["men"],
        "womenPct": round(a["women"] * 100 / a["size"], 1) if a["size"] else None,
        "adjoints": a["adjoints"],
        "ageAvg": round(sum(ages) / len(ages), 1) if ages else None,
        "ageMin": min(ages) if ages else None,
        "ageMax": max(ages) if ages else None,
    }
    out[insee] = rec

json.dump(out, open(os.path.join(DATA, "council.json"), "w"),
          ensure_ascii=False, separators=(",", ":"))

# coverage vs the mayor index
try:
    maires = json.load(open(os.path.join(DATA, "maires.json")))["maires"]
    mset = {m["insee"] for m in maires}
    matched = sum(1 for i in mset if i in out)
    print("✓ council.json — %d communes (%d élus lus) · couverture maires %d / %d (%.1f%%)"
          % (len(out), rows, matched, len(mset), matched * 100 / len(mset)), file=sys.stderr)
except Exception as e:
    print("✓ council.json — %d communes (%d élus)" % (len(out), rows), file=sys.stderr)
