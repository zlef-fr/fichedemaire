#!/usr/bin/env python3
"""
Commune finances from OFGL (Observatoire des Finances et de la Gestion publique
Locales) — the "budget principal" of each commune, 2017-2024.

Reads ofgl-communes.csv (curated agrégats) → per-commune time series + the
standard financial-health ratios that every Chambre régionale des comptes uses:
  · taux d'épargne brute   = épargne brute / recettes de fonctionnement
  · capacité de désendettement = encours de dette / épargne brute  (en années)
  · poids de l'annuité, part des frais de personnel …
No judgement — the ratios are reported with their reference thresholds in the UI.

Outputs:
  data/finances/<shard>.json   (shard = INSEE[:2]; loaded lazily by the server)
  merges a compact "fin" headline + population into data/maires.json
Source: data.ofgl.fr (licence Ouverte).
"""
import csv, json, os, sys
from collections import defaultdict

HERE = os.path.dirname(__file__)
RAW = os.path.join(HERE, "raw", "ofgl-communes.csv")
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))
FINDIR = os.path.join(DATA, "finances")
os.makedirs(FINDIR, exist_ok=True)

KEY = {
    "Recettes de fonctionnement": "rf",
    "Dépenses de fonctionnement": "df",
    "Epargne brute": "eb",
    "Epargne nette": "en",
    "Encours de dette": "dette",
    "Annuité de la dette": "annuite",
    "Dépenses d'équipement": "equip",
    "Frais de personnel": "perso",
    "Dotation globale de fonctionnement": "dgf",
    "Impôts locaux": "impots",
    "Impôts et taxes": "imptax",
    "Recettes totales": "rtot",
    "Charges financières": "chfin",
    "Subventions aux personnes de droit privé": "subv",
}

def shard_of(insee):
    return insee[:2]

def fnum(s):
    s = (s or "").strip()
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None

# insee -> year -> key -> [montant, perHab]
series = defaultdict(lambda: defaultdict(dict))
meta = {}          # insee -> {commune, dep, reg, epci, categ, rural, touristique, montagne, tranche}
pop = {}           # insee -> year -> ptot

n = 0
with open(RAW, encoding="utf-8-sig") as f:
    r = csv.DictReader(f, delimiter=";")
    for row in r:
        n += 1
        insee = (row.get("com_code") or "").strip()
        if not insee:
            continue
        insee = insee.zfill(5)
        ag = (row.get("agregat") or "").strip()
        k = KEY.get(ag)
        if not k:
            continue
        year = (row.get("exer") or "")[:4]
        if not year.isdigit():
            continue
        m = fnum(row.get("montant"))
        h = fnum(row.get("euros_par_habitant"))
        series[insee][year][k] = [m, h]
        p = row.get("ptot")
        if p and p.strip().isdigit():
            pop.setdefault(insee, {})[year] = int(p.strip())
        if insee not in meta:
            meta[insee] = {
                "commune": (row.get("com_name") or "").strip(),
                "dep": (row.get("dep_code") or "").strip(),
                "depNom": (row.get("dep_name") or "").strip(),
                "reg": (row.get("reg_name") or "").strip(),
                "epci": (row.get("epci_name") or "").strip(),
                "categ": (row.get("categ") or "").strip(),
                "rural": (row.get("rural") or "").strip() == "Oui",
                "touristique": (row.get("touristique") or "").strip() == "Oui",
                "montagne": (row.get("montagne") or "").strip() == "Oui",
                "tranche": (row.get("tranche_population") or "").strip(),
            }
        if n % 500000 == 0:
            print("  … %d rows" % n, file=sys.stderr)

print("· parsed %d rows, %d communes" % (n, len(series)), file=sys.stderr)

def ratios(years):
    """Compute latest-year financial-health ratios from the montants."""
    if not years:
        return None, None
    latest = max(years)
    y = years[latest]
    def m(k):
        v = y.get(k)
        return v[0] if v and v[0] is not None else None
    def h(k):
        v = y.get(k)
        return v[1] if v and v[1] is not None else None
    rf, eb, df, dette, annuite, perso = m("rf"), m("eb"), m("df"), m("dette"), m("annuite"), m("perso")
    r = {
        "tauxEpargne": round(eb / rf * 100, 1) if rf and eb is not None and rf > 0 else None,
        "desendet": round(dette / eb, 1) if dette is not None and eb and eb > 0 else None,
        "epargneNegative": eb is not None and eb <= 0,
        "partPerso": round(perso / df * 100, 1) if df and perso is not None and df > 0 else None,
        "poidsAnnuite": round(annuite / rf * 100, 1) if rf and annuite is not None and rf > 0 else None,
        "dettePerHab": round(h("dette")) if h("dette") is not None else None,
        "ebPerHab": round(h("eb")) if h("eb") is not None else None,
        "dfPerHab": round(h("df")) if h("df") is not None else None,
        "rfPerHab": round(h("rf")) if h("rf") is not None else None,
        "equipPerHab": round(h("equip")) if h("equip") is not None else None,
        "persoPerHab": round(h("perso")) if h("perso") is not None else None,
    }
    return latest, r

# ── build shards + collect headline for maires merge ────────────────────────
shards = defaultdict(dict)
headline = {}   # insee -> {pop, fin}
for insee, years in series.items():
    latest, r = ratios(years)
    # compact per-key series (drop years with no useful value)
    ser = {}
    for k in KEY.values():
        pts = []
        for y in sorted(years):
            v = years[y].get(k)
            if v and (v[0] is not None or v[1] is not None):
                pts.append({"y": int(y),
                            "m": None if v[0] is None else round(v[0]),
                            "h": None if v[1] is None else round(v[1], 1)})
        if pts:
            ser[k] = pts
    latest_pop = pop.get(insee, {}).get(latest) if latest else None
    entry = {
        "meta": meta.get(insee, {}),
        "latest": int(latest) if latest else None,
        "pop": latest_pop,
        "ratios": r,
        "series": ser,
    }
    shards[shard_of(insee)][insee] = entry
    if latest and r:
        headline[insee] = {
            "pop": latest_pop,
            "fin": {
                "year": int(latest),
                "tauxEpargne": r["tauxEpargne"],
                "desendet": r["desendet"],
                "epargneNegative": r["epargneNegative"],
                "dettePerHab": r["dettePerHab"],
                "dfPerHab": r["dfPerHab"],
                "ebPerHab": r["ebPerHab"],
            },
        }

for sh, obj in shards.items():
    json.dump(obj, open(os.path.join(FINDIR, sh + ".json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
print("· wrote %d shard files" % len(shards), file=sys.stderr)

# ── merge headline into maires.json ─────────────────────────────────────────
mfile = os.path.join(DATA, "maires.json")
doc = json.load(open(mfile))
matched = 0
for m in doc["maires"]:
    hd = headline.get(m["insee"])
    if hd:
        m["pop"] = hd["pop"]
        m["fin"] = hd["fin"]
        matched += 1
json.dump(doc, open(mfile, "w"), ensure_ascii=False, separators=(",", ":"))
print("✓ finances merged into %d/%d maires" % (matched, len(doc["maires"])), file=sys.stderr)
