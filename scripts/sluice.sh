#!/usr/bin/env bash
# Pull build inputs from Sluice (the fleet's open-data gateway) instead of hitting
# the upstream provider from this pipeline.
#
# Why: Sluice fetches each source once per interval for the whole fleet, keeps the
# current version PLUS its predecessors, and hands back byte-identical files. So a
# rebuild is cheap, reproducible, and can be pinned to an older version when an
# upstream publishes something broken.
#
#   source scripts/sluice.sh
#   sluice_get fr-an-deputes pipeline/raw/dep.zip          # latest
#   sluice_get fr-an-deputes pipeline/raw/dep.zip 20260729T041500Z   # pinned
#   sluice_versions fr-an-deputes                          # what's available
#
# Sluice down, or a source it has never fetched? Every call falls back to the
# upstream URL recorded in scripts/sluice-sources.json, so the pipeline is never
# hostage to the gateway.
SLUICE_BASE="${SLUICE_BASE:-http://localhost:10099}"
_SLUICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SLUICE_SOURCES="${SLUICE_SOURCES:-$_SLUICE_DIR/sluice-sources.json}"
# Registering/refreshing needs the write token; reading a feed does not.
if [ -z "${SLUICE_TOKEN:-}" ] && [ -r /root/.env.sluice ]; then
  # shellcheck disable=SC1091
  . /root/.env.sluice
fi

_sluice_human() {
  if command -v numfmt >/dev/null 2>&1; then numfmt --to=iec --suffix=B "$1"; else echo "$1 B"; fi
}

_sluice_up() {
  curl -fsS --max-time 5 "$SLUICE_BASE/healthz" >/dev/null 2>&1
}

# Descriptor for one id, straight out of the repo's source catalogue.
_sluice_descriptor() {
  python3 - "$SLUICE_SOURCES" "$1" <<'PY'
import json, sys
src, want = sys.argv[1], sys.argv[2]
for d in json.load(open(src)):
    if d["id"] == want:
        print(json.dumps(d)); sys.exit(0)
sys.exit(1)
PY
}

# Register (or update) a source. Idempotent: same descriptor, same result.
_sluice_register() {
  local id="$1" body
  body="$(_sluice_descriptor "$id")" || { echo "  ! $id is not in $(basename "$SLUICE_SOURCES")"; return 1; }
  [ -n "${SLUICE_TOKEN:-}" ] || { echo "  ! no SLUICE_TOKEN — cannot register $id"; return 1; }
  curl -fsS -X PUT "$SLUICE_BASE/api/sources/$id" \
    -H "x-sluice-token: $SLUICE_TOKEN" -H 'x-sluice-owner: fiche' \
    -H 'content-type: application/json' -d "$body" >/dev/null
}

# Force Sluice to fetch now and wait for it (a 700 MB bulk export takes minutes).
_sluice_refresh() {
  [ -n "${SLUICE_TOKEN:-}" ] || return 1
  curl -fsS --max-time 2400 -X POST "$SLUICE_BASE/api/sources/$1/refresh" \
    -H "x-sluice-token: $SLUICE_TOKEN" >/dev/null
}

# The upstream URL to use when Sluice can't serve. Mirrors the adapter's own
# resolver for release-tagged sources.
_sluice_fallback_url() {
  local id="$1" desc url repo asset tag
  desc="$(_sluice_descriptor "$id")" || return 1
  url="$(printf '%s' "$desc" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("url") or "")')"
  if [ -n "$url" ]; then echo "$url"; return 0; fi
  repo="$(printf '%s' "$desc" | python3 -c 'import json,sys; print((json.load(sys.stdin).get("options",{}).get("resolve") or {}).get("repo") or "")')"
  asset="$(printf '%s' "$desc" | python3 -c 'import json,sys; print((json.load(sys.stdin).get("options",{}).get("resolve") or {}).get("asset") or "")')"
  [ -n "$repo" ] && [ -n "$asset" ] || return 1
  tag="$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest" | grep -oE '"tag_name": *"[^"]+"' | cut -d'"' -f4)"
  [ -n "$tag" ] || return 1
  echo "https://github.com/$repo/releases/download/$tag/$asset"
}

sluice_versions() {
  curl -fsS "$SLUICE_BASE/api/artifact/$1/versions" | python3 -m json.tool
}

# sluice_get <source-id> <dest-path> [version]
sluice_get() {
  local id="$1" dest="$2" version="${3:-}" code url q=""
  [ -n "$id" ] && [ -n "$dest" ] || { echo "usage: sluice_get <id> <dest> [version]"; return 2; }
  mkdir -p "$(dirname "$dest")"
  [ -n "$version" ] && q="/$version"

  if _sluice_up; then
    _sluice_register "$id" >/dev/null 2>&1 || true
    code="$(curl -sS -o "$dest.part" -w '%{http_code}' "$SLUICE_BASE/api/artifact/$id$q")"
    if [ "$code" = "503" ] || [ "$code" = "404" ]; then
      echo "  · $id not cached yet — asking Sluice to fetch it (this hits upstream once for the whole fleet)"
      _sluice_register "$id" || true
      _sluice_refresh "$id" || true
      code="$(curl -sS -o "$dest.part" -w '%{http_code}' "$SLUICE_BASE/api/artifact/$id$q")"
    fi
    if [ "$code" = "200" ]; then
      mv "$dest.part" "$dest"
      echo "  ✓ $id ← sluice $(_sluice_human "$(wc -c < "$dest")")${version:+ @$version}"
      return 0
    fi
    rm -f "$dest.part"
    echo "  ! sluice answered HTTP $code for $id — falling back to upstream"
  else
    echo "  ! sluice unreachable at $SLUICE_BASE — falling back to upstream"
  fi

  url="$(_sluice_fallback_url "$id")" || { echo "  ✗ $id: no upstream fallback URL"; return 1; }
  curl -fsSL --http1.1 -o "$dest" "$url" || { echo "  ✗ $id: upstream fetch failed"; return 1; }
  echo "  ✓ $id ← upstream fallback $(_sluice_human "$(wc -c < "$dest")")"
}

# Register every source this repo declares, without pulling anything (used by the
# daily job so a brand-new source starts refreshing on Sluice's own schedule).
sluice_register_all() {
  local id
  _sluice_up || { echo "  ! sluice unreachable — skipping registration"; return 0; }
  for id in $(python3 -c 'import json,sys; print(" ".join(d["id"] for d in json.load(open(sys.argv[1]))))' "$SLUICE_SOURCES"); do
    if _sluice_register "$id"; then echo "  ✓ registered $id"; else echo "  ! failed to register $id"; fi
  done
}
