#!/usr/bin/env python3
"""Bulk-download OFGL commune finances (Budget principal, curated agregats, all years)."""
import urllib.parse, sys, os
AGREGATS = [
    "Recettes de fonctionnement","Dépenses de fonctionnement","Epargne brute","Epargne nette",
    "Encours de dette","Annuité de la dette","Dépenses d'équipement","Frais de personnel",
    "Dotation globale de fonctionnement","Impôts locaux","Impôts et taxes","Recettes totales",
    "Charges financières","Subventions aux personnes de droit privé",
]
inlist = ",".join('"%s"' % a.replace('"','') for a in AGREGATS)
where = 'type_de_budget="Budget principal" AND agregat IN (%s)' % inlist
select = "com_code,com_name,dep_code,dep_name,reg_name,epci_name,categ,rural,touristique,montagne,tranche_population,exer,agregat,montant,euros_par_habitant,ptot"
qs = urllib.parse.urlencode({"where": where, "select": select, "delimiter": ";"})
url = "https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-communes/exports/csv?" + qs
print(url)
