#!/usr/bin/env python3
"""
L'élection municipale de 2026 — participation + liste arrivée en tête, per commune.

Merges the Ministère de l'Intérieur per-commune result files (« Résultats -
Communes ») of the two rounds (15 & 22 mars 2026). A commune decided in the
first round appears only in the tour-1 file; a commune that went to a runoff is
overridden by its tour-2 record (the deciding round).

Per commune we keep, strictly from the official file:
  · participation : inscrits, votants, % votants, % abstention, blancs+nuls
  · liste arrivée en tête : libellé, % des exprimés, sièges au conseil municipal
    obtenus / total, écart (points) sur la 2ᵉ liste
  · nuance politique de cette liste — PARTIELLE : le ministère n'attribue une
    nuance qu'aux communes au scrutin de liste (≥ 1 000 hab.). Absente ailleurs.

Files are semicolon-separated, UTF-8. Layout = 18 fixed columns then repeating
13-column blocks per list; block count differs per file (computed from header).

Output: data/elections.json → { "<insee>": {tour,inscrits,votants,votantsPct,
         abstentionPct,blancsNuls,exprimes,listLabel,tete,nuance,nuanceLabel,
         pctExp,seats,totalSeats,marginPts,nLists} }
Source: data.gouv.fr — Résultats des élections municipales 2026 (licence Ouverte).
"""
import csv, json, os, re, sys

HERE = os.path.dirname(__file__)
RAW = os.path.join(HERE, "raw")
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))

T1 = os.path.join(RAW, "muni2026-communes-t1.csv")
T2 = os.path.join(RAW, "muni2026-communes-t2.csv")

BASE = 18   # fixed leading columns
BLK = 13    # columns per list block

# Ministère de l'Intérieur nuance codes → official French designation (factual
# decoding of the abbreviation). Unknown codes fall back to the raw code.
NUANCE = {
    "LEXG": "Extrême gauche", "LCOM": "Parti communiste français",
    "LFI": "La France insoumise", "LSOC": "Parti socialiste",
    "LRDG": "Parti radical de gauche", "LFG": "Front de gauche",
    "LVEC": "Écologistes", "LECO": "Écologistes divers", "LDVG": "Divers gauche",
    "LUG": "Union de la gauche", "LGA": "Gauche autonome",
    "LREG": "Régionaliste", "LDIV": "Divers", "LSE": "Sans étiquette",
    "LREM": "La République en marche", "LREN": "Renaissance", "LENM": "Ensemble ! (majorité présidentielle)",
    "LMDM": "MoDem", "LUDI": "UDI", "LHOR": "Horizons",
    "LUC": "Union du centre", "LDVC": "Divers centre",
    "LLR": "Les Républicains", "LUD": "Union de la droite",
    "LUDR": "Union de la droite", "LDVD": "Divers droite",
    "LDLF": "Debout la France", "LREC": "Reconquête",
    "LRN": "Rassemblement national", "LUXD": "Union de l'extrême droite",
    "LEXD": "Extrême droite", "LDSV": "Divers souverainiste",
    "LNC": "Non classée",
}


def to_int(s):
    d = re.sub(r"[^\d]", "", s or "")
    return int(d) if d else 0


def to_pct(s):
    s = (s or "").replace("%", "").replace(" ", "").replace(" ", "").replace(",", ".").strip()
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def parse_file(path, tour):
    if not os.path.exists(path):
        print("  (skip %s — not found)" % os.path.basename(path), file=sys.stderr)
        return {}
    out = {}
    with open(path, encoding="utf-8") as f:
        r = csv.reader(f, delimiter=";")
        header = next(r)
        nblocks = (len(header) - BASE) // BLK
        for row in r:
            if len(row) < BASE:
                continue
            insee = (row[2] or "").strip().zfill(5)
            if not insee or insee == "00000":
                continue
            inscrits = to_int(row[4])
            votants = to_int(row[5])
            exprimes = to_int(row[9])
            blancs = to_int(row[12])
            nuls = to_int(row[15])
            lists = []
            for b in range(nblocks):
                o = BASE + b * BLK
                if o + BLK > len(row):
                    break
                label = (row[o + 6] or "").strip()
                if not label:
                    continue
                # NB: the per-commune result file carries candidate names only for
                # runoff communes (tour-2 file), never in the tour-1 file — so we do
                # not surface a « tête de liste » field (it would exist for < 5 % of
                # communes only). The official list label is used instead.
                lists.append({
                    "label": label,
                    "nuance": (row[o + 4] or "").strip(),
                    "voix": to_int(row[o + 7]),
                    "pctExp": to_pct(row[o + 9]),
                    "seats": to_int(row[o + 11]),
                })
            rec = {
                "tour": tour,
                "inscrits": inscrits,
                "votants": votants,
                "votantsPct": to_pct(row[6]) if inscrits else None,
                "abstentionPct": to_pct(row[8]) if inscrits else None,
                "exprimes": exprimes,
                "blancsNuls": blancs + nuls,
                "nLists": len(lists),
            }
            if lists:
                total_seats = sum(l["seats"] for l in lists)
                # winner = most council seats; tie-break on votes
                winner = max(lists, key=lambda l: (l["seats"], l["voix"]))
                # runner-up by votes for the margin
                by_votes = sorted(lists, key=lambda l: l["voix"], reverse=True)
                margin = None
                if len(by_votes) >= 2 and winner["pctExp"] is not None and by_votes[1]["pctExp"] is not None:
                    ref = by_votes[0] if by_votes[0]["label"] == winner["label"] else winner
                    second = by_votes[1] if by_votes[0]["label"] == winner["label"] else by_votes[0]
                    if ref["pctExp"] is not None and second["pctExp"] is not None:
                        margin = round(ref["pctExp"] - second["pctExp"], 2)
                nuance = winner["nuance"]
                rec.update({
                    "listLabel": winner["label"],
                    "nuance": nuance or None,
                    "nuanceLabel": NUANCE.get(nuance, nuance) if nuance else None,
                    "pctExp": winner["pctExp"],
                    "seats": winner["seats"] or None,
                    "totalSeats": total_seats or None,
                    "marginPts": margin,
                })
            out[insee] = rec
    print("  · %s (tour %d) → %d communes" % (os.path.basename(path), tour, len(out)), file=sys.stderr)
    return out


merged = parse_file(T1, 1)
t2 = parse_file(T2, 2)
merged.update(t2)  # runoff record is the deciding one

json.dump(merged, open(os.path.join(DATA, "elections.json"), "w"),
          ensure_ascii=False, separators=(",", ":"))

with_nuance = sum(1 for v in merged.values() if v.get("nuance"))
with_list = sum(1 for v in merged.values() if v.get("listLabel"))
try:
    maires = json.load(open(os.path.join(DATA, "maires.json")))["maires"]
    mset = {m["insee"] for m in maires}
    matched = sum(1 for i in mset if i in merged)
    print("✓ elections.json — %d communes · %d avec liste en tête · %d avec nuance"
          % (len(merged), with_list, with_nuance), file=sys.stderr)
    print("  couverture maires %d / %d (%.1f%%) · runoff tour 2 : %d"
          % (matched, len(mset), matched * 100 / len(mset), len(t2)), file=sys.stderr)
except Exception:
    print("✓ elections.json — %d communes · %d nuance" % (len(merged), with_nuance), file=sys.stderr)
