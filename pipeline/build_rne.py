#!/usr/bin/env python3
"""
Build the mayor index from the Répertoire National des Élus (RNE).

Reads elus-maires-mai.csv → one light record per mayor (identity, age, CSP,
tenure, commune, slug). Also emits national stats. Finances (OFGL) and cumul
are merged in by later pipeline steps.

Source: data.gouv.fr — Répertoire national des élus (licence Ouverte).
Output: data/maires.json  +  data/stats.json
"""
import csv, json, os, re, sys, unicodedata
from datetime import date

HERE = os.path.dirname(__file__)
RAW = os.path.join(HERE, "raw")
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))
os.makedirs(DATA, exist_ok=True)

# Build reference date: real "today" so ages/seniority stay correct on the daily
# rebuild. FICHE_BUILD_DATE=YYYY-MM-DD pins it for a reproducible build.
TODAY = date.fromisoformat(os.environ["FICHE_BUILD_DATE"]) if os.environ.get("FICHE_BUILD_DATE") else date.today()

# ── helpers ──────────────────────────────────────────────────────────────
def strip_accents(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()

def slugify(s):
    s = strip_accents(s).lower()
    s = re.sub(r"[’'`]", " ", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return re.sub(r"-+", "-", s) or "commune"

def normkey(nom, prenom):
    return (strip_accents(nom).upper().strip() + "|" +
            strip_accents(prenom).upper().strip())

def parse_iso(s):
    s = (s or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None

def years_between(d0, d1):
    if not d0 or not d1:
        return None
    y = d1.year - d0.year - ((d1.month, d1.day) < (d0.month, d0.day))
    return y

def title_case_name(s):
    # RNE surnames are UPPERCASE; render nicely but keep particles lowercase.
    parts = re.split(r"([ '\-])", (s or "").strip())
    small = {"DE", "DU", "DES", "LA", "LE", "L", "D"}
    out = []
    for i, p in enumerate(parts):
        if p in (" ", "-", "'"):
            out.append(p)
            continue
        up = p.upper()
        if up in small and i != 0:
            out.append(p.lower())
        else:
            out.append(p.capitalize())
    return "".join(out)

# CSP groupings (first digit of the INSEE PCS code → broad family) for stats.
CSP_FAMILY = {
    "1": "Agriculteurs",
    "2": "Artisans, commerçants, chefs d'entreprise",
    "3": "Cadres et professions intellectuelles sup.",
    "4": "Professions intermédiaires",
    "5": "Employés",
    "6": "Ouvriers",
    "7": "Retraités",
    "8": "Sans activité professionnelle",
}

# ── parse ────────────────────────────────────────────────────────────────
maires = []
by_insee = {}
seen_slugs = {}
fonc_dates = []

with open(os.path.join(RAW, "elus-maires-mai.csv"), encoding="utf-8") as f:
    r = csv.DictReader(f, delimiter=";")
    for row in r:
        insee = (row.get("Code de la commune") or "").strip()
        commune = (row.get("Libellé de la commune") or "").strip()
        if not insee or not commune:
            continue
        # RNE drops leading zeros on INSEE for depts 1–9 ("1001" = Ain 01001);
        # normalise to canonical 5-char INSEE so the OFGL finance join matches.
        insee = insee.zfill(5)
        dep = (row.get("Code du département") or "").strip()
        depNom = (row.get("Libellé du département") or "").strip()
        # dept blank for collectivités à statut particulier (Paris/Lyon/Corse/DOM)
        if not dep:
            dep = (row.get("Code de la collectivité à statut particulier") or "").strip()
            if not depNom:
                depNom = (row.get("Libellé de la collectivité à statut particulier") or "").strip()
        if dep.isdigit():
            dep = dep.zfill(2)
        # collectivité à statut particulier (Paris, Lyon, Marseille arr. contexts, DOM)
        csp_code = (row.get("Code de la catégorie socio-professionnelle") or "").strip()
        csp_label = (row.get("Libellé de la catégorie socio-professionnelle") or "").strip()
        naissance = parse_iso(row.get("Date de naissance"))
        mandat = parse_iso(row.get("Date de début du mandat"))
        fonc = parse_iso(row.get("Date de début de la fonction"))
        if fonc:
            fonc_dates.append(fonc.isoformat())
        nom = (row.get("Nom de l'élu") or "").strip()
        prenom = (row.get("Prénom de l'élu") or "").strip()
        sexe = (row.get("Code sexe") or "").strip()

        base = slugify(commune)
        # ensure globally unique slug: append insee when the town name repeats
        slug = base
        if slug in seen_slugs:
            slug = base + "-" + insee
        seen_slugs[slug] = True

        rec = {
            "insee": insee,
            "slug": slug,
            "commune": commune,
            "dep": dep,
            "depNom": depNom,
            "nom": title_case_name(nom),
            "nomRaw": nom.upper(),
            "prenom": prenom,
            "sexe": sexe,
            "naissance": naissance.isoformat() if naissance else None,
            "age": years_between(naissance, TODAY),
            "csp": csp_code,
            "cspLabel": csp_label,
            "cspFamily": CSP_FAMILY.get(csp_code[:1], "Autre / non renseigné") if csp_code else "Non renseigné",
            "mandatStart": mandat.isoformat() if mandat else None,
            "foncStart": fonc.isoformat() if fonc else None,
            "anciennete": years_between(fonc, TODAY),
            # merged later:
            "pop": None,
            "fin": None,
        }
        maires.append(rec)
        by_insee[insee] = rec

maires.sort(key=lambda m: (m["depNom"], m["commune"]))

# ── stats ────────────────────────────────────────────────────────────────
n = len(maires)
women = sum(1 for m in maires if m["sexe"] == "F")
ages = [m["age"] for m in maires if m["age"] is not None]
csp_counts = {}
for m in maires:
    csp_counts[m["cspFamily"]] = csp_counts.get(m["cspFamily"], 0) + 1
fonc_dates.sort()

stats = {
    "count": n,
    "women": women,
    "womenPct": round(women * 100 / n, 1) if n else 0,
    "men": n - women,
    "ageAvg": round(sum(ages) / len(ages), 1) if ages else None,
    "ageMin": min(ages) if ages else None,
    "ageMax": max(ages) if ages else None,
    "cspFamilies": sorted(csp_counts.items(), key=lambda kv: -kv[1]),
    "foncDateMin": fonc_dates[0] if fonc_dates else None,
    "foncDateMax": fonc_dates[-1] if fonc_dates else None,
    # foncDateMedian tells us whether tenure is a useful axis or everyone's fresh
    "foncDateMedian": fonc_dates[len(fonc_dates)//2] if fonc_dates else None,
}

json.dump({"generatedAt": TODAY.isoformat(), "count": n, "maires": maires},
          open(os.path.join(DATA, "maires.json"), "w"),
          ensure_ascii=False, separators=(",", ":"))
json.dump(stats, open(os.path.join(DATA, "stats.json"), "w"),
          ensure_ascii=False, separators=(",", ":"))

print("✓ %d maires → maires.json" % n, file=sys.stderr)
print("  femmes %d (%.1f%%) · âge moy %.1f [%d–%d]" %
      (women, stats["womenPct"], stats["ageAvg"] or 0, stats["ageMin"] or 0, stats["ageMax"] or 0),
      file=sys.stderr)
print("  fonction: min %s · médiane %s · max %s" %
      (stats["foncDateMin"], stats["foncDateMedian"], stats["foncDateMax"]), file=sys.stderr)
