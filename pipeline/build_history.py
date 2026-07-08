#!/usr/bin/env python3
"""
Reconstruct the mandate history behind each commune's current mayor.

The live RNE (elus-maires-mai.csv) is a post-municipales-2026 snapshot: every
mayor's tenure reads "since March 2026", which is useless for veterans. Municipal
terms are national (…2014 · 2020 · 2026…), so we rebuild the previous holders:

  • 2020-2026 term  — from an ARCHIVED national RNE snapshot (Internet Archive
    capture of the data.gouv elus-maires resource, taken during 2020-2026).
    Full coverage (~34.6k communes). Matching a current mayor to the 2020-2026
    holder (nom+prénom+naissance, same commune) proves a renewal and gives the
    real "maire depuis" year.

  • 2014-2020 term  — best-effort only, added later by build_history_wikidata.py
    (Wikidata P6 mandates). Partial: notable/larger communes, gaps in rural ones.

Output: data/history.json  { "<insee>": { t2020, renewed, since, ... } }

Sources: Répertoire national des élus (licence Ouverte), archived via
web.archive.org. Reference date fixed (no runtime clock in the pipeline).
"""
import csv, gzip, io, json, os, re, sys, unicodedata
from datetime import date

HERE = os.path.dirname(__file__)
RAW = os.path.join(HERE, "raw")
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))

# Archived 2020-2026 RNE elus-maires snapshot. Fetch once into raw/ with:
#   curl -sL "http://web.archive.org/web/20250628120000id_/https://www.data.gouv.fr/fr/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503" \
#     -o pipeline/raw/elus-maires-2020-2026.csv.gz
SNAP_2020 = os.path.join(RAW, "elus-maires-2020-2026.csv.gz")


def strip_accents(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()


def pkey(nom, prenom):
    """Diacritic-insensitive identity key (same convention as lib/data.js hkey)."""
    return (strip_accents(nom).upper().strip() + "|" +
            strip_accents(prenom).upper().strip())


def parse_fr(s):
    """RNE archived dates are DD/MM/YYYY; the live file is ISO. Accept both."""
    s = (s or "").strip()
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", s)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    return None


def read_snapshot(path):
    """Read a (gzipped) RNE elus-maires CSV → { insee: {nom,prenom,naissance,fonc} }."""
    with open(path, "rb") as f:
        raw = f.read()
    try:
        raw = gzip.decompress(raw)
    except OSError:
        pass  # already plain CSV
    txt = raw.decode("utf-8", errors="replace")
    out = {}
    r = csv.DictReader(io.StringIO(txt), delimiter=";")
    for row in r:
        insee = (row.get("Code de la commune") or "").strip().zfill(5)
        if insee == "00000":
            continue
        out[insee] = {
            "nom": (row.get("Nom de l'élu") or "").strip(),
            "prenom": (row.get("Prénom de l'élu") or "").strip(),
            "naissance": parse_fr(row.get("Date de naissance")),
            "fonc": parse_fr(row.get("Date de début de la fonction")),
        }
    return out


def title_name(s):
    parts = re.split(r"([ '\-])", (s or "").strip())
    small = {"DE", "DU", "DES", "LA", "LE", "L", "D"}
    out = []
    for i, p in enumerate(parts):
        if p in (" ", "-", "'"):
            out.append(p); continue
        out.append(p.lower() if p.upper() in small and i != 0 else p.capitalize())
    return "".join(out)


def main():
    if not os.path.exists(SNAP_2020):
        print("✗ missing %s — see fetch command in the docstring" % SNAP_2020, file=sys.stderr)
        sys.exit(1)

    snap = read_snapshot(SNAP_2020)
    cur = json.load(open(os.path.join(DATA, "maires.json")))["maires"]

    hist = {}
    renewed_n = 0
    for m in cur:
        insee = m["insee"]
        prev = snap.get(insee)
        if not prev:
            continue
        entry = {}
        # 2020-2026 term holder (for the mandate-band label), always recorded
        pname = f"{prev['prenom']} {title_name(prev['nom'])}".strip()
        t2020 = {"name": pname}
        if prev["fonc"]:
            t2020["since"] = prev["fonc"].isoformat()
        entry["t2020"] = t2020

        # renewal: same person governs this commune in both snapshots?
        same = pkey(m["nomRaw"], m["prenom"]) == pkey(prev["nom"], prev["prenom"])
        # tighten with DOB when both are known (guards against namesakes)
        if same and m.get("naissance") and prev["naissance"]:
            same = m["naissance"] == prev["naissance"].isoformat()
        if same:
            entry["renewed"] = True
            # real "maire depuis" for the CURRENT mayor = their 2020-term start
            if prev["fonc"]:
                entry["since"] = prev["fonc"].isoformat()
            renewed_n += 1
        hist[insee] = entry

    json.dump(hist, open(os.path.join(DATA, "history.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
    print("✓ history.json — %d communes with a 2020-2026 holder, %d renewed in 2026 (%.1f%%)"
          % (len(hist), renewed_n, 100 * renewed_n / max(1, len(hist))), file=sys.stderr)


if __name__ == "__main__":
    main()
