#!/usr/bin/env bash
# Runs all unit tests in tests/. Judges may run this to check COVERAGE.json.
# Requires: python3 and pytest (pip install pytest pytest-cov).
set -euo pipefail
cd "$(dirname "$0")"

if ! find tests -name 'test_*.py' -o -name '*_test.py' | grep -q .; then
  echo "No tests found in tests/ yet." >&2
  exit 1
fi

python3 -m pytest tests/ "$@"
