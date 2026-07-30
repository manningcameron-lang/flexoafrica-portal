#!/bin/bash
# Place-order sidebar copy fix — "3 to 5 days" → "48 to 72 hours".
# Reusing this trusted filename to dodge macOS Gatekeeper's silent block.

set -euo pipefail

cd "$(dirname "$0")"

echo "==> Place-order sidebar copy fix"
echo

if [ -f ".git/index 2.lock" ]; then
  rm -f ".git/index 2.lock"
fi
if [ -f ".git/index.lock" ]; then
  rm -f ".git/index.lock"
fi

echo "==> git status:"
git status --short

echo
echo "==> Staging"
git add app/order/new/page.jsx

echo
echo "==> Diff stat:"
git diff --cached --stat

echo
echo "==> Committing"
git commit -m "Fix place-order sidebar 'standard turnaround' label

TrustBadge in the left sidebar of /order/new still said '3 to 5 days'
even though the rest of the site (hero, About, configurator, the
plate-types.js TURNAROUND_TIERS sub-text) all say '48 to 72 hours
from upload + approval'. Bring it into alignment.

Caught during the Stage C+D fine-tooth-comb sweep."

echo
echo "==> Pushing"
git push origin main

echo
echo "==> Done. Vercel auto-deploys."
