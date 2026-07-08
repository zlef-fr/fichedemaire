#!/usr/bin/env python3
"""
"Où va l'argent ?" — the public contracts each commune awarded, from the DECP
(Données Essentielles de la Commande Publique), Bercy open data, licence Ouverte.

Pipeline
  1. Read the commune SIREN directory (OFGL: com_code -> siren).  A DECP
     "acheteur.id" is a 14-digit SIRET whose first 9 digits are the SIREN, so a
     marché belongs to a commune iff its acheteur SIREN is that commune's SIREN.
  2. Stream decp-marches.csv (decp-2022-marches-valides).  DEDUPE each marché by
     (id + acheteur) — the DECP re-declares the same marché several times.  Keep
     only marchés whose acheteur is a commune.
  3. DATA HYGIENE — montant is declarative and dirty (INT_MAX=2147483647
     sentinels, round billions used as framework-agreement ceilings, all-nines
     placeholders, 0/negative).  Drop montant <= 0 or > MONTANT_CAP; log the count.
  4. Enrich the titulaire SIRET with a raison sociale from decp-names.csv
     (decp_augmente).  Fallback: a formatted SIRET when no name is known.
  5. Aggregate per commune INSEE: total €, marché count, notification-year span,
     top suppliers (by summed montant, grouped by SIREN) and the biggest marchés.

Outputs
  data/decp/<shard>.json   (shard = INSEE[:2], same scheme as data/finances/)
                           keyed by INSEE -> {total,count,years,suppliers,marches}
The server lazy-loads a shard on the first fiche that needs it.
"""
import csv, json, os, sys
from collections import defaultdict

csv.field_size_limit(10 ** 7)

HERE = os.path.dirname(__file__)
RAW = os.path.join(HERE, "raw")
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))
OUTDIR = os.path.join(DATA, "decp")
os.makedirs(OUTDIR, exist_ok=True)

MARCHES = os.path.join(RAW, "decp-marches.csv")
NAMES = os.path.join(RAW, "decp-names.csv")
SIRENCSV = os.path.join(RAW, "ofgl-siren.csv")

MONTANT_CAP = 50_000_000      # above this a montant is an accord-cadre ceiling / sentinel
TOP_SUPPLIERS = 10
TOP_MARCHES = 6
OBJET_MAX = 110


def shard_of(insee):
    return insee[:2]


def fnum(s):
    s = (s or "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def clean_objet(s):
    s = " ".join((s or "").split())
    if len(s) > OBJET_MAX:
        s = s[:OBJET_MAX].rstrip() + "…"
    return s


def fmt_siret(sid):
    """A bare SIRET, spaced like INSEE prints it, as a readable last resort."""
    d = "".join(ch for ch in (sid or "") if ch.isdigit())
    if len(d) == 14:
        return "SIRET %s %s %s %s" % (d[0:3], d[3:6], d[6:9], d[9:14])
    if len(d) == 9:
        return "SIREN %s %s %s" % (d[0:3], d[3:6], d[6:9])
    return sid or "—"


# ── 1. commune SIREN directory ──────────────────────────────────────────────
siren2insee = {}
with open(SIRENCSV, encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        c = (row.get("com_code") or "").strip().zfill(5)
        s = (row.get("siren") or "").strip()
        if c and s:
            siren2insee[s] = c
print("· %d commune SIRENs" % len(siren2insee), file=sys.stderr)

# ── 4. SIREN -> raison sociale (built once, reused for every titulaire) ──────
siren2name = {}
if os.path.exists(NAMES):
    with open(NAMES, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            sid = (row.get("siretetablissement") or "").strip()
            if len(sid) < 9 or not sid[:9].isdigit():
                continue
            siren = sid[:9]
            if siren in siren2name:
                continue
            nm = (row.get("denominationunitelegale") or "").strip() \
                or (row.get("denominationsocialeetablissement") or "").strip()
            if nm and nm.upper() not in ("CDL", "NC", "MQ", "N/A"):
                siren2name[siren] = nm
    print("· %d SIREN→name pairs" % len(siren2name), file=sys.stderr)
else:
    print("· (no decp-names.csv — suppliers will show SIRET)", file=sys.stderr)


def name_of(sid):
    d = "".join(ch for ch in (sid or "") if ch.isdigit())
    if len(d) >= 9:
        nm = siren2name.get(d[:9])
        if nm:
            return nm
    return fmt_siret(sid)


# ── 2 + 3 + 5. stream marchés, dedupe, filter to communes, aggregate ────────
class Agg:
    __slots__ = ("total", "count", "sup", "march", "ymin", "ymax", "capped")

    def __init__(self):
        self.total = 0.0
        self.count = 0
        self.sup = defaultdict(lambda: [0.0, 0])   # siren/id -> [total, count]
        self.march = []                            # (montant, objet, titulaire_id, date)
        self.ymin = None
        self.ymax = None
        self.capped = 0


per = defaultdict(Agg)
seen = set()
rows = read = 0
dropped_bad = 0

with open(MARCHES, encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        rows += 1
        ach = (row.get("acheteur_id") or "").strip()
        insee = siren2insee.get(ach[:9])
        if not insee:
            continue
        key = (row.get("id") or "").strip() + "|" + ach
        if key in seen:            # duplicate declaration of the same marché
            continue
        seen.add(key)
        d = per[insee]
        m = fnum(row.get("montant"))
        if m is None or m <= 0 or m > MONTANT_CAP:
            dropped_bad += 1
            d.capped += 1
            continue
        read += 1
        d.total += m
        d.count += 1
        # notification-year span
        dt = (row.get("datenotification") or "").strip()
        yr = dt[:4]
        if yr.isdigit():
            y = int(yr)
            d.ymin = y if d.ymin is None else min(d.ymin, y)
            d.ymax = y if d.ymax is None else max(d.ymax, y)
        # primary titulaire → supplier bucket (grouped by SIREN when a SIRET)
        tid = (row.get("titulaire_id_1") or "").strip()
        ttype = (row.get("titulaire_typeidentifiant_1") or "").strip().upper()
        digits = "".join(ch for ch in tid if ch.isdigit())
        if ttype == "SIRET" and len(digits) >= 9:
            supkey = digits[:9]
            s = d.sup[supkey]
            s[0] += m
            s[1] += 1
        # keep only enough candidates for the "biggest marchés" list
        d.march.append((m, clean_objet(row.get("objet")), tid, dt))
        if len(d.march) > 400:
            d.march.sort(reverse=True)
            d.march = d.march[:60]

print("· %d rows, %d commune marchés kept, %d dropped (montant<=0 / >%d€)"
      % (rows, read, dropped_bad, MONTANT_CAP), file=sys.stderr)

# ── build shards ────────────────────────────────────────────────────────────
shards = defaultdict(dict)
communes = 0
for insee, d in per.items():
    if d.count == 0:
        continue
    communes += 1
    suppliers = []
    for siren, (tot, cnt) in sorted(d.sup.items(), key=lambda x: -x[1][0])[:TOP_SUPPLIERS]:
        suppliers.append({
            "name": siren2name.get(siren) or fmt_siret(siren),
            "named": siren in siren2name,
            "siren": siren,
            "total": round(tot),
            "count": cnt,
        })
    d.march.sort(reverse=True)
    marches = []
    for m, objet, tid, dt in d.march[:TOP_MARCHES]:
        marches.append({
            "objet": objet or "—",
            "montant": round(m),
            "titulaire": name_of(tid),
            "date": dt or None,
        })
    entry = {
        "total": round(d.total),
        "count": d.count,
        "suppliers": suppliers,
        "marches": marches,
    }
    if d.ymin and d.ymax:
        entry["years"] = [d.ymin, d.ymax]
    if d.capped:
        entry["capped"] = d.capped
    shards[shard_of(insee)][insee] = entry

for sh, obj in shards.items():
    json.dump(obj, open(os.path.join(OUTDIR, sh + ".json"), "w"),
              ensure_ascii=False, separators=(",", ":"))

grand = sum(e["total"] for sh in shards.values() for e in sh.values())
print("✓ wrote %d shard files · %d communes with marchés · %s € total awarded"
      % (len(shards), communes, "{:,}".format(grand)), file=sys.stderr)
