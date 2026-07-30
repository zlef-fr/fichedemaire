#!/usr/bin/env python3
"""
Best-effort enrichment of data/history.json from Wikidata (P6 mayor mandates).

Adds, for the ~3.2k communes Wikidata covers (notable / larger — rural gaps
are expected and accepted):
  • t2014  — the mayor of the 2014-2020 term (holder active mid-2019), for the
             mandate-band label on the finance charts.
  • deeper "maire depuis" — when the CURRENT mayor has an open-ended Wikidata
    mandate, its start year is their true first year (e.g. 1995), which beats
    the 2020 floor the archived-RNE layer can give.

Runs AFTER build_history.py; augments the file in place. Fails soft: if WDQS is
unreachable, the 2020-2026 layer already written by build_history.py still ships.

Source: Wikidata (CC0), query.wikidata.org. Reference date fixed (2026-07-08).
"""
import json, os, sys, unicodedata, urllib.parse, urllib.request
from datetime import date

HERE = os.path.dirname(__file__)
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))
# Build reference date: real "today" so ages/seniority stay correct on the daily
# rebuild. FICHE_BUILD_DATE=YYYY-MM-DD pins it for a reproducible build.
TODAY = date.fromisoformat(os.environ["FICHE_BUILD_DATE"]) if os.environ.get("FICHE_BUILD_DATE") else date.today()
# the 2014-2020 municipal term (installed spring 2014 → renewed spring/summer 2020)
TERM0, TERM1 = date(2014, 4, 1), date(2020, 7, 1)

WDQS = "https://query.wikidata.org/sparql"
QUERY = """
SELECT ?insee ?mayorLabel ?start ?end WHERE {
  ?commune wdt:P31 wd:Q484170 ; wdt:P374 ?insee ; p:P6 ?st .
  ?st ps:P6 ?mayor ; pq:P580 ?start .
  OPTIONAL { ?st pq:P582 ?end . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
"""


def strip_accents(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()


def surname_key(s):
    return strip_accents(s).upper().strip()


def parse_day(iso):
    try:
        return date(int(iso[0:4]), int(iso[5:7]), int(iso[8:10]))
    except (ValueError, TypeError):
        return None


def fetch():
    url = WDQS + "?" + urllib.parse.urlencode({"query": QUERY, "format": "json"})
    req = urllib.request.Request(url, headers={
        "Accept": "application/sparql-results+json",
        "User-Agent": "fichedemaire/1.0 (https://fichedemaire.zlef.fr; claude@zlef.fr)",
    })
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)["results"]["bindings"]


def main():
    hist_path = os.path.join(DATA, "history.json")
    hist = json.load(open(hist_path)) if os.path.exists(hist_path) else {}
    cur = {m["insee"]: m for m in json.load(open(os.path.join(DATA, "maires.json")))["maires"]}

    try:
        rows = fetch()
    except Exception as e:  # WDQS down / timeout → keep the archived-RNE layer
        print("⚠ Wikidata fetch failed (%s) — history.json left as-is" % e, file=sys.stderr)
        return

    by_insee = {}
    for r in rows:
        insee = r["insee"]["value"].zfill(5)
        by_insee.setdefault(insee, []).append({
            "name": r["mayorLabel"]["value"],
            "start": parse_day(r["start"]["value"]),
            "end": parse_day(r["end"]["value"]) if "end" in r else None,
        })

    n_t2014 = n_since = 0
    for insee, mandates in by_insee.items():
        mandates = [m for m in mandates if m["start"]]
        if not mandates:
            continue
        entry = hist.setdefault(insee, {})

        # 2014-2020 holder = the mandate with the most time inside the term window
        # (dominant mayor — beats picking a single reference point, which favours
        # short end-of-term stand-ins over the person who actually held the term).
        def overlap_days(m):
            s = max(m["start"], TERM0)
            e = min(m["end"] or TODAY, TERM1)
            return (e - s).days
        # ≥1 yr inside the term, else it's a boundary stand-in (or a data gap where
        # the real holder simply lacks a dated Wikidata statement) — don't mislabel.
        cand = [(overlap_days(m), m) for m in mandates]
        cand = [(d, m) for d, m in cand if d >= 365]
        if cand:
            holder = max(cand, key=lambda dm: dm[0])[1]
            entry["t2014"] = {"name": holder["name"], "src": "wikidata"}
            n_t2014 += 1

        # deeper true tenure: current mayor's open-ended mandate start year
        cm = cur.get(insee)
        if cm:
            want = surname_key(cm["nomRaw"])
            open_ms = [m for m in mandates
                       if (not m["end"] or m["end"] >= TODAY) and want and want in surname_key(m["name"])]
            if open_ms:
                first = min(open_ms, key=lambda m: m["start"])["start"].isoformat()
                # keep the earliest "since" across layers (archived RNE vs Wikidata)
                if "since" not in entry or first < entry["since"]:
                    entry["since"] = first
                    entry["sinceSrc"] = "wikidata"
                    n_since += 1

    json.dump(hist, open(hist_path, "w"), ensure_ascii=False, separators=(",", ":"))
    print("✓ Wikidata: %d communes queried · %d with a 2014-2020 holder · %d deeper tenure dates"
          % (len(by_insee), n_t2014, n_since), file=sys.stderr)


if __name__ == "__main__":
    main()
