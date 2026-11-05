#!/usr/bin/env bash
# Regenerate gzipped base64 chunks of index.html for Railway env vars.
# Usage: ./railway_bundle.sh
# Prints APP_B64_PARTS and writes chunk files under .railway-bundle/
# Then set them on the service (skipDeploys) and redeploy, e.g. via Railway MCP:
#   APP_B64_PARTS, APP_B64_1..N  (and keep BOOTSTRAP_PY / start command unchanged)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/index.html"
OUT="$ROOT/.railway-bundle"
CHUNK=30000

if [[ ! -f "$SRC" ]]; then
  echo "Missing $SRC" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"

# gzip then base64 (no line wraps)
gzip -9 -c "$SRC" | base64 -w0 > "$OUT/app.b64"
SIZE=$(wc -c < "$OUT/app.b64" | tr -d ' ')
python3 - "$OUT" "$CHUNK" "$SIZE" <<'PY'
import sys, pathlib
out = pathlib.Path(sys.argv[1])
chunk = int(sys.argv[2])
b = (out / "app.b64").read_text().strip()
parts = [b[i:i+chunk] for i in range(0, len(b), chunk)] or [""]
(out / "APP_B64_PARTS").write_text(str(len(parts)))
for i, p in enumerate(parts, 1):
    (out / f"APP_B64_{i}").write_text(p)
print(f"source bytes: kept in index.html")
print(f"gzip+b64 bytes: {len(b)}")
print(f"APP_B64_PARTS={len(parts)}")
for i, p in enumerate(parts, 1):
    print(f"  APP_B64_{i}: {len(p)} chars -> {out / f'APP_B64_{i}'}")
print(f"Wrote chunks under {out}")
print("Set variables APP_B64_PARTS and APP_B64_1..N on barnyard-web (skip deploys), then redeploy.")
PY
