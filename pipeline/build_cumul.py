#!/usr/bin/env python3
"""
Cumul des mandats — cross-reference each mayor against the other RNE registers
(députés, sénateurs, conseillers départementaux / régionaux, députés européens,
et présidences/vice-présidences d'EPCI) by name + date of birth.

A mayor who is also, say, a conseiller départemental or an EPCI president holds
several mandates at once; we surface those factually. Being a plain conseiller
communautaire is near-universal for mayors, so EPCI roles are kept only when a
function (président / vice-président) is declared.

Output: data/cumul.json  →  { "<insee>": [ {type, label}, … ] }
"""
import csv, json, os, re, sys, unicodedata

HERE = os.path.dirname(__file__)
RAW = os.path.join(HERE, "raw")
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))

def strip_accents(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()

def pkey(nom, prenom, naissance):
    return (strip_accents(nom).upper().strip() + "|" +
            strip_accents(prenom).upper().strip() + "|" + (naissance or "").strip())

# ── mayor lookup keyed by person (name+dob) → insee ─────────────────────────
maires = json.load(open(os.path.join(DATA, "maires.json")))["maires"]
person2insee = {}
for m in maires:
    # maires.json stores a title-cased name; rebuild the raw key from nomRaw+prenom
    person2insee[pkey(m["nomRaw"], m["prenom"], m["naissance"])] = m["insee"]

cumul = {}  # insee -> list of mandates
def add(insee, type_, label):
    cumul.setdefault(insee, [])
    if not any(x["label"] == label for x in cumul[insee]):
        cumul[insee].append({"type": type_, "label": label})

def scan(fname, builder, cols=("Nom de l'élu", "Prénom de l'élu", "Date de naissance")):
    path = os.path.join(RAW, fname)
    if not os.path.exists(path):
        print("  (skip %s — not found)" % fname, file=sys.stderr)
        return
    n = 0
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter=";"):
            k = pkey(row.get(cols[0]), row.get(cols[1]), row.get(cols[2]))
            insee = person2insee.get(k)
            if not insee:
                continue
            res = builder(row)
            if res:
                add(insee, res[0], res[1])
                n += 1
    print("  · %s → %d matches" % (fname, n), file=sys.stderr)

def dep_lbl(row):
    return (row.get("Libellé du département") or row.get("Libellé de la région") or "").strip()

# députés — circo code is dep(2)+circo(2), e.g. "0601" = 1ʳᵉ circo des Alpes-Maritimes
def circo_no(r):
    c = (r.get("Code de la circonscription législative") or "").strip()
    if not c:
        return ""
    try:
        n = int(c[-2:])
        return " — %s circo." % ("1ʳᵉ" if n == 1 else "%dᵉ" % n)
    except ValueError:
        return ""
scan("rne-deputes.csv", lambda r: (
    "depute",
    "Député·e" + (" de " + dep_lbl(r) if dep_lbl(r) else "") + circo_no(r)))

# sénateurs
scan("rne-senateurs.csv", lambda r: (
    "senateur", "Sénateur·rice" + (" — " + dep_lbl(r) if dep_lbl(r) else "")))

# députés européens
scan("rne-rpe.csv", lambda r: ("europe", "Député·e européen·ne"))

# conseillers départementaux (+ fonction si présidence/VP)
def cd_builder(r):
    fonc = (r.get("Libellé de la fonction") or "").strip()
    if fonc:
        return ("cd", "%s du conseil départemental%s" % (fonc, " — " + dep_lbl(r) if dep_lbl(r) else ""))
    return ("cd", "Conseiller·ère départemental·e" + (" — " + dep_lbl(r) if dep_lbl(r) else ""))
scan("rne-cd.csv", cd_builder)

# conseillers régionaux (+ fonction)
def cr_builder(r):
    fonc = (r.get("Libellé de la fonction") or "").strip()
    reg = (r.get("Libellé de la région") or "").strip()
    if fonc:
        return ("cr", "%s du conseil régional%s" % (fonc, " — " + reg if reg else ""))
    return ("cr", "Conseiller·ère régional·e" + (" — " + reg if reg else ""))
scan("rne-cr.csv", cr_builder)

# EPCI — only presidencies / vice-presidencies (plain membership is universal)
def epci_builder(r):
    fonc = (r.get("Libellé de la fonction") or "").strip()
    if not fonc:
        return None
    epci = (r.get("Libellé de l'EPCI") or "").strip()
    return ("epci", "%s%s" % (fonc, " — " + epci if epci else " d'un EPCI"))
scan("rne-epci.csv", epci_builder)

json.dump(cumul, open(os.path.join(DATA, "cumul.json"), "w"),
          ensure_ascii=False, separators=(",", ":"))
multi = sum(1 for v in cumul.values() if v)
print("✓ cumul.json — %d maires avec au moins un autre mandat" % multi, file=sys.stderr)
