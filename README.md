# FicheDeMaire.fr

**La fiche vivante de votre commune et de son maire.** Pour chacune des ~34 600
communes françaises : qui est le maire (identité, âge, profession, cumul des
mandats) et dans quel état sont les finances de la commune (épargne, dette,
capacité de désendettement, évolution sur 8 ans). 100 % reconstruit à partir de
données publiques officielles — aucun avis, aucune note morale.

Sibling of [FicheDéputé.fr](https://fichedepute.fr) / [FicheSénateur](https://senat.fichedepute.fr).
Port **10117**. Live on `fichedemaire.zlef.fr` (→ `fichedemaire.fr` once the apex
zone is added to Cloudflare).

## Sources (licence Ouverte)

| Source | Usage |
|--------|-------|
| **RNE** — Répertoire national des élus (data.gouv.fr) | Identité de chaque maire + cumul des mandats |
| **OFGL** — Observatoire des finances et de la gestion publique locales | Comptes des communes 2017-2024 (budget principal) |
| **HATVP** | Déclarations d'intérêts des maires (communes > 20 000 hab.) |

Les élections municipales de **mars 2026** ayant renouvelé les conseils, les
comptes affichés (dernier exercice publié) décrivent la commune **héritée**, pas
le mandat en cours — c'est indiqué sur chaque fiche et sur `/methode`.

## Architecture

Zero-dependency Node HTTP server (only `@resvg/resvg-js` for OG PNGs). The light
mayor index + stats + cumul + HATVP load into memory at boot; the per-commune
finance detail lives in **department shards** (`data/finances/<dep>.json`) loaded
lazily per fiche. Vanilla SPA (`public/app.js` core + `views.js` renderers +
`i18n.js`), SSR snapshot for crawlers, sitemap **index** + per-department child
sitemaps (34k URLs), dynamic per-commune OG cards. FR default + EN.

```
pipeline/  build_rne.py · build_finances.py · build_cumul.py · build_hatvp.py
lib/       data.js (index + lazy shards) · seo.js · ssr.js · og.js · tracker.js · locales.js · faq.js
public/    SPA (app/views/i18n/styles) + PWA
data/      maires.json · stats.json · cumul.json · hatvp.json · finances/<dep>.json  (committed)
```

## Build & run

```bash
docker compose up -d --build       # serves on :10117

# regenerate the datasets (raw/ is gitignored):
bash scripts/refresh-data.sh                 # RNE + OFGL + cumul + finances
WITH_HATVP=1 bash scripts/refresh-data.sh    # also refresh HATVP
```

## Financial-health ratios (CRC references)

- **Capacité de désendettement** = encours de dette ÷ épargne brute (années).
  < 8 sain · 8-12 à surveiller · > 12 tendu.
- **Taux d'épargne brute** = épargne brute ÷ recettes de fonctionnement.
  ≥ 10 % confortable.

Ratios volatile on very small communes — financial rankings apply a 10 000-hab. floor.
