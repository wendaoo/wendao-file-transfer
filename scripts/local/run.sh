#!/usr/bin/env bash
# Backward-compatible entry point for the self-contained shared build.
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$project_dir"
if [[ "${1:-}" == install ]]; then
  exec bash scripts/shared/bootstrap.sh
fi
exec bash scripts/shared/build.sh "${1:-package}"
