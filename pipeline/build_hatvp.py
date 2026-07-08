#!/usr/bin/env python3
"""
HATVP — déclaration d'intérêts of mayors.

Parses the official HATVP open-data dump (declarations.xml) and keeps the most
recent "Déclaration d'intérêts" (type DI) of every declarant who lists a MAIRE
mandate. Extracts a FACTUAL summary — counts of declared professional activities,
financial holdings, leadership roles, plus consultant/spouse/volunteer flags —
and a link back to the official HATVP page. No interpretation.

NOTE: only mayors of communes > 20 000 hab. (and a few other thresholds) must
file with HATVP, so this covers a small subset. Patrimoine (déclaration de
situation patrimoniale) is NOT open data for local officials — only interests.

Output: data/hatvp.json  →  { "NOM|PRENOM": {…summary…} }
Source: https://www.hatvp.fr/livraison/merge/declarations.xml (licence Ouverte).
"""
import xml.etree.ElementTree as ET
import json, os, sys, unicodedata, re, gzip

HERE = os.path.dirname(__file__)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw", "declarations.xml")
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))

def open_src(p):
    return gzip.open(p, "rb") if p.endswith(".gz") else open(p, "rb")

def norm(s):
    return unicodedata.normalize("NFKD", (s or "")).encode("ascii", "ignore").decode().upper().strip()

def count(el, path):
    return len(el.findall(path))

# a declared value is "empty" when absent, marked néant, or a placeholder the
# declarant typed to mean "nothing" ("aucune", "néant", "[Données non publiées]")
_EMPTY = re.compile(r"^(|aucun[e]?|neant|n[ée]ant|non|ras|sans objet|\[.*\])$")
def clean(s):
    s = (s or "").strip()
    return "" if _EMPTY.match(norm(s).lower()) else s

def period(el):
    d, f = clean(el.findtext("dateDebut")), clean(el.findtext("dateFin"))
    return {"deb": d or None, "fin": f or None}

def items_of(el, dto, build, cap=12):
    """Map each declared item of a DTO through build(); drop empties; cap length."""
    out = []
    for it in el.findall(dto + "/items/items"):
        r = build(it)
        if r and any(v for k, v in r.items() if k not in ("deb", "fin")):
            out.append(r)
        if len(out) >= cap:
            break
    return out

def neant(el, tag):
    d = el.find(tag)
    return d is None or (d.findtext("neant") or "").strip().lower() == "true"

def parse_date(s):
    try:
        d, t = (s or "").split(" ")
        dd, mm, yy = d.split("/")
        return yy + mm + dd + t.replace(":", "")
    except Exception:
        return ""

def mayor_commune(el):
    # find a MAIRE mandate (not adjoint) and return the commune string if any
    for m in el.findall("mandatElectifDto/items/items/descriptionMandat"):
        txt = (m.text or "").strip()
        up = norm(txt)
        if "MAIRE" in up and "ADJOINT" not in up:
            # "MAIRE DE LOURDES" → "LOURDES"; bare "MAIRE" → ""
            c = re.sub(r"^MAIRE\s+(DE\s+|D['’]?\s*|DU\s+|DES\s+)?", "", up).strip()
            return c
    return None

best = {}   # key -> (dateKey, summary)
n = 0
for ev, el in ET.iterparse(open_src(SRC), events=("end",)):
    if el.tag != "declaration":
        continue
    g = el.find("general")
    if g is not None:
        tid = (g.findtext("typeDeclaration/id") or "").strip()
        dec = g.find("declarant")
        # DI = déclaration d'intérêts (local officials incl. mayors)
        if tid == "DI" and dec is not None:
            commune = mayor_commune(el)
            if commune is not None:  # this declarant is (also) a mayor
                key = norm(dec.findtext("nom")) + "|" + norm(dec.findtext("prenom"))
                dk = parse_date(el.findtext("dateDepot"))
                if key not in best or dk > best[key][0]:
                    slug = (norm(dec.findtext("nom")).lower().replace(" ", "-") + "-" +
                            norm(dec.findtext("prenom")).lower().replace(" ", "-"))
                    # ── detailed responsibility lists (labels, not just counts) ──
                    # participationDirigeant = seats on external bodies: SEM/SPL,
                    # EPIC (ex. Société des grands projets), SDIS, associations…
                    # exactly the "responsibilities during the mandate" a mayor
                    # holds beyond the RNE's elective mandates.
                    sieges = items_of(el, "participationDirigeantDto", lambda it: {
                        "soc": clean(it.findtext("nomSociete")),
                        "act": clean(it.findtext("activite")),
                        **period(it),
                    })
                    benevole = items_of(el, "fonctionBenevoleDto", lambda it: {
                        "soc": clean(it.findtext("nomStructure")),
                        "act": clean(it.findtext("descriptionActivite")),
                    })
                    activites = items_of(el, "activProfCinqDerniereDto", lambda it: {
                        "act": clean(it.findtext("description")),
                        "soc": clean(it.findtext("employeur")),
                        **period(it),
                    })
                    summary = {
                        "commune": commune or None,
                        "activitesProf": count(el, "activProfCinqDerniereDto/items/items"),
                        "participationsFinancieres": count(el, "participationFinanciereDto/items/items"),
                        "participationsDirigeant": count(el, "participationDirigeantDto/items/items"),
                        "consultant": not neant(el, "activConsultantDto"),
                        "activiteConjoint": not neant(el, "activProfConjointDto"),
                        "benevole": not neant(el, "fonctionBenevoleDto"),
                        # detailed lists (may be empty even when a count is > 0,
                        # e.g. every value was a "[Données non publiées]" placeholder)
                        "sieges": sieges,
                        "benevoleList": benevole,
                        "activitesList": activites,
                        "dateDepot": (el.findtext("dateDepot") or "")[:10],
                        "url": "https://www.hatvp.fr/pages_nominatives/" + slug,
                    }
                    best[key] = (dk, summary)
    n += 1
    el.clear()

out = {k: v[1] for k, v in best.items()}
json.dump(out, open(os.path.join(DATA, "hatvp.json"), "w"),
          ensure_ascii=False, separators=(",", ":"))
print("✓ %d déclarations parsées, %d maires avec déclaration d'intérêts" % (n, len(out)), file=sys.stderr)
