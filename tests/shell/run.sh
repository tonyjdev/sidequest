#!/usr/bin/env bash
set -euo pipefail

# Runs every shell suite under tests/shell. A suite is any *.test.sh file: it
# reports `PASS <n>` on success and a non-zero exit code with `FAIL:` lines on
# stderr otherwise.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
FAILED=0
SUITES=0

while IFS= read -r suite; do
    SUITES=$((SUITES + 1))
    printf '\n== %s ==\n' "${suite#"$ROOT/"}"
    if ! bash "$suite"; then
        FAILED=$((FAILED + 1))
    fi
done < <(find "$ROOT/tests/shell" -name '*.test.sh' -type f | sort)

if ((SUITES == 0)); then
    printf 'no shell suites found under tests/shell\n' >&2
    exit 1
fi

if ((FAILED != 0)); then
    printf '\n%d of %d shell suites failed\n' "$FAILED" "$SUITES" >&2
    exit 1
fi

printf '\n%d shell suites passed\n' "$SUITES"
