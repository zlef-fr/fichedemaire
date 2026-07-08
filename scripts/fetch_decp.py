#!/usr/bin/env python3
"""Print the two bulk-download URLs for the DECP "v2" money-trail dataset.

  1. marches  — decp-2022-marches-valides: the awarded public contracts
                (~660k rows). We keep only the columns we need.
  2. names    — decp_augmente: the same DECP family, enriched by Bercy with the
                SIRENE denominations → SIRET → raison sociale, so the top
                suppliers show a real company name instead of a bare SIRET.

Usage:  python3 scripts/fetch_decp.py marches   # or:  names
Mirrors scripts/fetch_ofgl.py (build the URL here, curl it in refresh-data.sh).
Source: data.economie.gouv.fr — licence Ouverte.
"""
import sys, urllib.parse

BASE = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets"

MARCHES_SELECT = ",".join([
    "id", "objet", "codecpv", "procedure", "nature",
    "titulaire_id_1", "titulaire_typeidentifiant_1",
    "titulaire_id_2", "titulaire_typeidentifiant_2",
    "titulaire_id_3", "titulaire_typeidentifiant_3",
    "acheteur_id", "montant", "datenotification", "dureemois",
])
NAMES_SELECT = "siretetablissement,denominationunitelegale,denominationsocialeetablissement"


def url(dataset, select):
    qs = urllib.parse.urlencode({"select": select, "delimiter": ","})
    return "%s/%s/exports/csv?%s" % (BASE, dataset, qs)


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "marches"
    if which == "names":
        print(url("decp_augmente", NAMES_SELECT))
    elif which == "siren":
        # commune SIREN directory: (com_code, siren) from OFGL — one agrégat is
        # enough to enumerate every commune once (deduped in build_decp.py).
        qs = urllib.parse.urlencode({
            "where": 'agregat="Encours de dette" AND type_de_budget="Budget principal"',
            "select": "com_code,siren", "delimiter": ",",
        })
        print("https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-communes/exports/csv?" + qs)
    else:
        print(url("decp-2022-marches-valides", MARCHES_SELECT))
