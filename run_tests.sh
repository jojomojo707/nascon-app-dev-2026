#!/usr/bin/env bash
# Runs all unit tests in tests/ and prints line coverage. Judges may run this to check COVERAGE.json.
# Uses Node's built-in test runner (`node --test`, part of Node 20+; no npm test framework).
# If Node is not installed, runs the same command inside the pre-pulled node:20-alpine image (needs Docker).
#
#   ./run_tests.sh                               every *.test.js file under tests/
#   ./run_tests.sh tests/fixtures.test.js        only the given file(s)
#   ./run_tests.sh --test-name-pattern=swiss     only tests whose name matches (other node --test flags work too)
set -euo pipefail
cd "$(dirname "$0")"

files=()
flags=()
for arg in "$@"; do
  if [[ -f "$arg" ]]; then files+=("$arg"); else flags+=("$arg"); fi
done
if [[ ${#files[@]} -eq 0 ]]; then
  while IFS= read -r f; do files+=("$f"); done < <(find tests -name '*.test.js' | sort)
fi
if [[ ${#files[@]} -eq 0 ]]; then
  echo "No tests found in tests/ yet." >&2
  exit 1
fi

# Tests import backend code, which needs backend/node_modules (gitignored, so missing on a fresh clone).
needs_install=false
if [[ -f backend/package.json && ! -d backend/node_modules ]]; then
  needs_install=true
fi

if command -v node >/dev/null 2>&1; then
  if $needs_install; then npm ci --prefix backend; fi
  node --test --experimental-test-coverage ${flags[@]+"${flags[@]}"} "${files[@]}"
else
  cmd="node --test --experimental-test-coverage $(printf '%q ' ${flags[@]+"${flags[@]}"} "${files[@]}")"
  if $needs_install; then cmd="npm ci --prefix backend && $cmd"; fi
  # MSYS_NO_PATHCONV stops Git Bash on Windows from rewriting the /repo path.
  MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD":/repo -w /repo node:20-alpine sh -c "$cmd"
fi
