#!/usr/bin/env bash
set -euo pipefail

# Every case runs against a disposable clone built from scratch below: the real
# checkout, its branches and its worktrees are never touched.

TESTS_PASSED=0
TESTS_FAILED=0
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
SCRIPT="$ROOT/scripts/git/task-worktree.sh"
FUNCTIONS="$ROOT/scripts/git/task-worktree-functions.sh"
SANDBOX="$(mktemp -d)"
RUN_STATUS=0

# The task lifecycle never runs the project's own commands in these tests unless
# a case opts in: the real ones need a Node runtime and a package registry.
export SIDEQUEST_CHANGELOG_CMD=
export SIDEQUEST_PNPM_INSTALL_CMD=
export SIDEQUEST_BUILD_CMD=

cleanup() {
    rm -rf "$SANDBOX"
}
trap cleanup EXIT HUP INT TERM

pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    printf 'FAIL: %s\n' "$1" >&2
}

assert_equals() {
    if [[ "$1" == "$2" ]]; then
        pass
    else
        fail "$3 (expected '$1', got '$2')"
    fi
}

assert_contains() {
    if [[ "$2" == *"$1"* ]]; then
        pass
    else
        fail "$3 (expected to contain '$1', got '$2')"
    fi
}

assert_file_exists() {
    if [[ -e "$1" ]]; then
        pass
    else
        fail "$2"
    fi
}

assert_file_missing() {
    if [[ -e "$1" ]]; then
        fail "$2"
    else
        pass
    fi
}

run_in() {
    local directory="$1"
    shift

    set +e
    (cd "$directory" && "$@") >"$SANDBOX/stdout" 2>"$SANDBOX/stderr"
    RUN_STATUS=$?
    set -e
}

assert_succeeds_in() {
    local directory="$1"
    local message="$2"
    shift 2

    run_in "$directory" "$@"
    if [[ "$RUN_STATUS" -eq 0 ]]; then
        pass
    else
        fail "$message (status $RUN_STATUS, stderr: $(tail -n 3 "$SANDBOX/stderr"))"
    fi
}

# Every refusal must also keep the stdout contract: machine-readable output is
# for success only, so a caller can never read a path out of a failed run.
assert_fails_in() {
    local expected="$1"
    local directory="$2"
    local message="$3"
    shift 3

    run_in "$directory" "$@"
    if [[ "$RUN_STATUS" -eq "$expected" && ! -s "$SANDBOX/stdout" ]]; then
        pass
    else
        fail "$message (status $RUN_STATUS, stdout: $(cat "$SANDBOX/stdout"), stderr: $(tail -n 2 "$SANDBOX/stderr"))"
    fi
}

stdout_value() {
    awk -v key="$1" 'index($0, key "=") == 1 { print substr($0, length(key) + 2) }' "$SANDBOX/stdout"
}

stderr_text() {
    cat "$SANDBOX/stderr"
}

# --- Disposable repository -------------------------------------------------

ORIGIN="$SANDBOX/origin.git"
SEED="$SANDBOX/seed"
REPO="$SANDBOX/repo"
CLI="$REPO/scripts/git/task-worktree.sh"
COMMON="$REPO/.git"

git init -q -b develop --bare "$ORIGIN"
git init -b develop "$SEED" >/dev/null
git -C "$SEED" config user.email test@example.com
git -C "$SEED" config user.name Tester

mkdir -p "$SEED/scripts/git" "$SEED/changelog"
printf '%s\n' '/.worktrees' '/node_modules' '/dist' '.env' '*.marker' > "$SEED/.gitignore"
# The manifest has to exist in the base ref: preparation skips install and build
# without one, which is its own case below.
printf '{ "name": "sidequest-fixture", "private": true }\n' > "$SEED/package.json"
printf '# Changelog\n' > "$SEED/CHANGELOG.md"
: > "$SEED/changelog/.gitkeep"

# The scripts under test ship inside the fixture so every worktree created from
# origin/develop carries its own copy, exactly as the real repository does.
cp "$SCRIPT" "$SEED/scripts/git/task-worktree.sh"
cp "$FUNCTIONS" "$SEED/scripts/git/task-worktree-functions.sh"
chmod +x "$SEED/scripts/git/task-worktree.sh"

git -C "$SEED" add .
git -C "$SEED" commit -m seed >/dev/null
git -C "$SEED" remote add origin "$ORIGIN"
git -C "$SEED" push -u origin develop >/dev/null 2>&1

git clone "$ORIGIN" "$REPO" >/dev/null 2>&1
git -C "$REPO" checkout -q develop
git -C "$REPO" config user.email test@example.com
git -C "$REPO" config user.name Tester
printf 'MYSQL_DATABASE=sidequest_primary\n' > "$REPO/.env"
# An unrelated broken remote must warn without blocking initialization.
git -C "$REPO" remote add unavailable /path/that/does/not/exist

publish_and_merge() {
    local branch="$1"

    git -C "$SEED" fetch -q origin
    git -C "$SEED" checkout -q develop
    git -C "$SEED" reset -q --hard origin/develop
    git -C "$SEED" merge -q --no-ff "origin/$branch" -m "Merge $branch"
    git -C "$SEED" push -q origin develop
    git -C "$REPO" fetch -q --prune origin
}

# Merges a task branch that was never pushed, so `finish` meets a branch with
# nothing published to delete.
merge_unpublished() {
    local branch="$1"

    git -C "$SEED" fetch -q "$REPO" "$branch"
    git -C "$SEED" checkout -q develop
    git -C "$SEED" reset -q --hard origin/develop
    git -C "$SEED" merge -q --no-ff FETCH_HEAD -m "Merge $branch"
    git -C "$SEED" push -q origin develop
    git -C "$REPO" fetch -q --prune origin
}

commit_in_worktree() {
    local worktree="$1"
    local name="$2"

    printf 'work\n' > "$worktree/$name"
    git -C "$worktree" add -- "$name"
    git -C "$worktree" commit -q -m "Work on $name"
}

# --- init ------------------------------------------------------------------

assert_succeeds_in "$REPO" 'init claims a free task' "$CLI" init SQST-1201 happy-path
assert_equals "$REPO/.worktrees/sqst-1201" "$(stdout_value SIDEQUEST_WORKTREE)" 'init reports the worktree path'
assert_equals 'feat/sqst-1201-happy-path' "$(stdout_value SIDEQUEST_BRANCH)" 'init reports the branch'
assert_file_exists "$REPO/.worktrees/sqst-1201/CHANGELOG.md" 'the worktree is a checkout of the base ref'
assert_equals 'feat/sqst-1201-happy-path' "$(git -C "$REPO/.worktrees/sqst-1201" branch --show-current)" 'the worktree stands on the task branch'
assert_equals 'develop' "$(git -C "$REPO" branch --show-current)" 'the primary checkout keeps its branch'
assert_equals '' "$(git -C "$REPO" status --porcelain --untracked-files=no)" 'the primary checkout is untouched'
assert_equals '' "$(git -C "$REPO" log --format=%s origin/develop..develop)" 'init commits nothing anywhere'
assert_equals 'MYSQL_DATABASE=sidequest_primary' "$(cat "$REPO/.worktrees/sqst-1201/.env")" 'init copies the .env of the primary checkout'
assert_equals '' "$(git -C "$REPO/.worktrees/sqst-1201" rev-parse --abbrev-ref '@{u}' 2>/dev/null || true)" 'the task branch tracks nothing until it is published'
assert_equals '' "$(git -C "$REPO/.worktrees/sqst-1201" status --porcelain --untracked-files=all)" 'a prepared worktree reads as clean'

assert_succeeds_in "$REPO" 'init runs the preparation commands inside the worktree' \
    env SIDEQUEST_PNPM_INSTALL_CMD='printf pnpm > install.marker' \
        SIDEQUEST_BUILD_CMD='printf build >> install.marker' \
        "$CLI" init SQST-1202 environment
assert_equals 'pnpmbuild' "$(cat "$REPO/.worktrees/sqst-1202/install.marker")" 'every preparation step runs, in order'
assert_file_missing "$REPO/install.marker" 'preparation never runs in the primary checkout'

assert_succeeds_in "$REPO" '--no-deps and --no-build skip preparation' \
    env SIDEQUEST_PNPM_INSTALL_CMD='printf pnpm > install.marker' \
        SIDEQUEST_BUILD_CMD='printf build > build.marker' \
        "$CLI" init SQST-1203 flags --no-deps --no-build
assert_file_missing "$REPO/.worktrees/sqst-1203/install.marker" '--no-deps skips the install'
assert_file_missing "$REPO/.worktrees/sqst-1203/build.marker" '--no-build skips the build'

assert_fails_in 1 "$REPO" 'a failing preparation step fails the init' \
    env SIDEQUEST_PNPM_INSTALL_CMD='exit 3' "$CLI" init SQST-1204 broken-environment
assert_contains 'recover SQST-1204' "$(stderr_text)" 'the failure names its own repair'
assert_file_exists "$REPO/.worktrees/sqst-1204" 'the claimed worktree survives a failed preparation'

assert_fails_in 1 "$REPO" 'an unknown key shape is refused' "$CLI" init SQST1205 slug
assert_fails_in 1 "$REPO" 'an unsafe slug is refused' "$CLI" init SQST-1205 'Not a Slug'
assert_fails_in 1 "$REPO" 'a slug that is not lowercase is refused' "$CLI" init SQST-1205 Uppercase
assert_fails_in 1 "$REPO" 'an unknown option is refused' "$CLI" init SQST-1205 slug --unknown

git -C "$REPO" branch feat/sqst-1206-other-slug develop
assert_fails_in 1 "$REPO" 'a local branch already owning the key refuses the claim' "$CLI" init SQST-1206 new-slug
assert_contains 'feat/sqst-1206-other-slug' "$(stderr_text)" 'the refusal names the owning branch'
git -C "$REPO" branch -D feat/sqst-1206-other-slug >/dev/null

git -C "$SEED" push -q origin develop:refs/heads/feat/sqst-1207-published
git -C "$REPO" fetch -q --prune origin
assert_fails_in 1 "$REPO" 'a published branch owning the key refuses the claim' "$CLI" init SQST-1207 new-slug

mkdir -p "$REPO/.worktrees/sqst-1208"
assert_fails_in 1 "$REPO" 'an existing worktree path refuses the claim' "$CLI" init SQST-1208 taken
rmdir "$REPO/.worktrees/sqst-1208"

printf 'dirty\n' >> "$REPO/CHANGELOG.md"
assert_fails_in 1 "$REPO" 'a dirty primary checkout refuses the claim' "$CLI" init SQST-1209 dirty-primary
git -C "$REPO" checkout -q -- CHANGELOG.md

flock -x "$COMMON/sidequest-init-task.lock" -c 'sleep 3' &
LOCK_HOLDER=$!
sleep 0.3
assert_fails_in 2 "$REPO" 'an active init lock refuses a second claim' \
    env SIDEQUEST_LOCK_WAIT_SECONDS=1 "$CLI" init SQST-1210 locked
assert_contains 'sidequest-init-task.lock' "$(stderr_text)" 'the refusal names the lock to wait for'
wait "$LOCK_HOLDER"

# --- recover ---------------------------------------------------------------

assert_succeeds_in "$REPO" 'recover finishes an interrupted preparation' \
    env SIDEQUEST_PNPM_INSTALL_CMD='printf pnpm > install.marker' "$CLI" recover SQST-1204
assert_equals 'pnpm' "$(cat "$REPO/.worktrees/sqst-1204/install.marker")" 'recover runs the preparation it was missing'
assert_equals "$REPO/.worktrees/sqst-1204" "$(stdout_value SIDEQUEST_WORKTREE)" 'recover reports the worktree'
assert_succeeds_in "$REPO" 'recover is idempotent' "$CLI" recover SQST-1204
assert_fails_in 2 "$REPO" 'recover refuses a key nobody claimed' "$CLI" recover SQST-1299

# The repository before its scaffolding task has nothing to install from. That
# must skip the step and say so, not fail the claim.
rm -- "$REPO/.worktrees/sqst-1204/package.json"
assert_succeeds_in "$REPO" 'preparation is skipped when the worktree has no manifest' \
    env SIDEQUEST_PNPM_INSTALL_CMD='printf pnpm > skipped.marker' "$CLI" recover SQST-1204
assert_file_missing "$REPO/.worktrees/sqst-1204/skipped.marker" 'no manifest means no install'
assert_contains 'no package.json' "$(stderr_text)" 'the skip is said out loud'
git -C "$REPO/.worktrees/sqst-1204" checkout -q -- package.json

# --- remove ----------------------------------------------------------------

assert_fails_in 2 "$REPO" 'removal without the explicit flag is refused' "$CLI" remove SQST-1203 --please
mkdir -p "$REPO/.worktrees/sqst-1203/node_modules" "$REPO/.worktrees/sqst-1203/dist"
: > "$REPO/.worktrees/sqst-1203/node_modules/installed"
assert_succeeds_in "$REPO" 'an abandoned worktree is removed with its dependencies' "$CLI" remove SQST-1203 --abandoned
assert_file_missing "$REPO/.worktrees/sqst-1203" 'the abandoned worktree is gone'
assert_equals '' "$(git -C "$REPO" branch --list feat/sqst-1203-flags)" 'the abandoned branch is gone'

printf 'source\n' > "$REPO/.worktrees/sqst-1202/untracked.ts"
assert_fails_in 2 "$REPO" 'a worktree carrying untracked sources is not removed' "$CLI" remove SQST-1202 --abandoned
rm -- "$REPO/.worktrees/sqst-1202/untracked.ts"

commit_in_worktree "$REPO/.worktrees/sqst-1202" work.txt
assert_fails_in 2 "$REPO" 'a branch carrying commits is not removed' "$CLI" remove SQST-1202 --abandoned

git -C "$REPO" push -q -u origin feat/sqst-1201-happy-path
assert_fails_in 2 "$REPO" 'a published branch is not removed' "$CLI" remove SQST-1201 --abandoned

# --- preflight -------------------------------------------------------------

assert_succeeds_in "$REPO/.worktrees/sqst-1201" 'preflight accepts the task worktree' "$CLI" preflight
assert_equals "$REPO/.worktrees/sqst-1201" "$(stdout_value SIDEQUEST_WORKTREE)" 'preflight reports the worktree'
assert_equals "$REPO" "$(stdout_value SIDEQUEST_PRIMARY)" 'preflight reports the primary checkout'
assert_equals 'feat/sqst-1201-happy-path' "$(stdout_value SIDEQUEST_BRANCH)" 'preflight reports the branch'
assert_equals 'SQST-1201' "$(stdout_value SIDEQUEST_TASK_KEY)" 'preflight reports the Workspace key of the branch'
assert_equals 'true' "$(stdout_value SIDEQUEST_LINKED)" 'preflight reports the worktree link'
assert_fails_in 1 "$REPO" 'preflight refuses an integration branch' "$CLI" preflight

git init -q -b develop "$SANDBOX/other"
assert_fails_in 1 "$SANDBOX/other" 'preflight refuses another repository' "$CLI" preflight

git -C "$REPO" branch feat/nokey-branch develop
git -C "$REPO" worktree add -q "$SANDBOX/nokey" feat/nokey-branch
assert_fails_in 1 "$SANDBOX/nokey" 'preflight refuses a branch carrying no task key' "$CLI" preflight
git -C "$REPO" worktree remove --force "$SANDBOX/nokey"
git -C "$REPO" branch -D feat/nokey-branch >/dev/null

# --- finish ----------------------------------------------------------------

commit_in_worktree "$REPO/.worktrees/sqst-1201" feature.txt
assert_fails_in 1 "$REPO" 'finish refuses a branch that is not merged' "$CLI" finish SQST-1201

printf 'source\n' > "$REPO/.worktrees/sqst-1202/untracked.ts"
merge_unpublished feat/sqst-1202-environment
assert_fails_in 2 "$REPO" 'finish refuses a worktree with uncommitted work' "$CLI" finish SQST-1202
rm -- "$REPO/.worktrees/sqst-1202/untracked.ts"

assert_succeeds_in "$REPO/.worktrees/sqst-1202" 'finish integrates an unpublished merged branch' \
    env SIDEQUEST_CHANGELOG_CMD='printf entry > changelog/generated.md' "$CLI" finish SQST-1202
assert_equals "$REPO" "$(stdout_value SIDEQUEST_PRIMARY)" 'finish reports the primary checkout'
assert_file_missing "$REPO/.worktrees/sqst-1202" 'the completed worktree is removed'
assert_equals '' "$(git -C "$REPO" branch --list feat/sqst-1202-environment)" 'the merged branch is deleted locally'
assert_equals 'develop' "$(git -C "$REPO" branch --show-current)" 'the primary checkout is left on the integration branch'
assert_file_exists "$REPO/work.txt" 'the merged work reached the primary checkout'
assert_equals 'chore: regenerate changelog' "$(git -C "$REPO" log -1 --format=%s develop)" 'the changelog is regenerated on the primary checkout'
assert_equals "$(git -C "$REPO" rev-parse develop)" "$(git -C "$REPO" rev-parse origin/develop)" 'the regenerated changelog is pushed'

git -C "$REPO/.worktrees/sqst-1201" push -q origin feat/sqst-1201-happy-path
publish_and_merge feat/sqst-1201-happy-path
assert_succeeds_in "$REPO/.worktrees/sqst-1201" 'finish integrates a published merged branch' "$CLI" finish SQST-1201
assert_file_missing "$REPO/.worktrees/sqst-1201" 'the completed worktree is removed'
assert_equals '' "$(git -C "$REPO" branch --list feat/sqst-1201-happy-path)" 'the merged branch is deleted locally'
assert_equals '' "$(git -C "$REPO" branch --remotes --list origin/feat/sqst-1201-happy-path)" 'the merged branch is deleted on origin'
assert_file_exists "$REPO/feature.txt" 'the merged work reached the primary checkout'

flock -x "$COMMON/sidequest-integration.lock" -c 'sleep 3' &
LOCK_HOLDER=$!
sleep 0.3
assert_fails_in 2 "$REPO" 'an active integration lock refuses a second close' "$CLI" finish SQST-1204
assert_fails_in 2 "$REPO" 'with-integration-lock waits for nobody' "$CLI" with-integration-lock -- true
wait "$LOCK_HOLDER"

assert_succeeds_in "$REPO" 'with-integration-lock runs its command' "$CLI" with-integration-lock -- true
assert_fails_in 1 "$REPO" 'with-integration-lock requires the separator' "$CLI" with-integration-lock true

# --- shell functions -------------------------------------------------------

assert_succeeds_in "$REPO" 'the functions file moves the caller shell into the worktree' \
    bash -c 'source "$1" >/dev/null; init-task SQST-1220 shell-functions >/dev/null; [[ "$PWD" == "$2/.worktrees/sqst-1220" ]]' \
    _ "$REPO/scripts/git/task-worktree-functions.sh" "$REPO"
assert_succeeds_in "$REPO" 'the functions file refuses a call with no slug' \
    bash -c 'source "$1" >/dev/null; ! init-task SQST-1221 2>/dev/null' \
    _ "$REPO/scripts/git/task-worktree-functions.sh"
assert_succeeds_in "$REPO" 'run directly, the functions file falls back to the CLI' \
    "$REPO/scripts/git/task-worktree-functions.sh" --help

# --- report ----------------------------------------------------------------

if ((TESTS_FAILED != 0)); then
    printf 'FAILED %d, PASSED %d\n' "$TESTS_FAILED" "$TESTS_PASSED" >&2
    exit 1
fi

printf 'PASS %d\n' "$TESTS_PASSED"
