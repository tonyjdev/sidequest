#!/usr/bin/env bash
set -euo pipefail

# Canonical Git state machine for parallel task worktrees.
#
# Every Git transition, validation, lock and recovery path of the task lifecycle
# lives here. The agent commands and the sourced shell wrapper call this one
# implementation: no tool owns branch state of its own.
#
# The task state itself lives in the Workspace application, never in this
# repository, so this script never reads or writes it. The caller resolves the
# task in Workspace and hands over the two values a branch name is made of; what
# claims a task here is the branch, and nothing else.
#
# Contract:
#   stdout  machine-readable `KEY=value` lines, nothing else
#   stderr  every diagnostic, including the human `cd <path>` fallback
#   exit 0  success
#   exit 1  validation or operational failure
#   exit 2  active lock, or an unsafe recovery/removal condition

SCRIPT_NAME="$(basename "$0")"
LOCK_NAME_INIT="sidequest-init-task.lock"
LOCK_NAME_INTEGRATION="sidequest-integration.lock"
LOCK_FILE=""
LOCK_FD=9
BASE_REF="origin/develop"
BASE_BRANCH="develop"

# Init callers queue behind one another so independent tasks can be claimed at
# the same time. Integration never waits: a second close must be told which
# operation is still running instead of silently blocking on it.
LOCK_WAIT_SECONDS="${SIDEQUEST_LOCK_WAIT_SECONDS:-15}"

# Project commands, not Git ones. They are injected so the shell suite can
# exercise every path without a Node runtime; an empty value skips the step.
#
# The changelog is empty by default: Sidequest generates none today. The
# machinery stays because the day it does, the aggregate has to be regenerated
# on the primary checkout after the merge and never on a feature branch.
CHANGELOG_COMMAND="${SIDEQUEST_CHANGELOG_CMD-}"
PNPM_INSTALL_COMMAND="${SIDEQUEST_PNPM_INSTALL_CMD-pnpm install --frozen-lockfile}"
BUILD_COMMAND="${SIDEQUEST_BUILD_CMD-pnpm run build}"

CHANGELOG_PATHS=(CHANGELOG.md changelog)

# Appended to every failure the environment preparation can report, so an
# interrupted init names its own repair instead of leaving a half-prepared
# worktree with no instructions.
RECOVERY_HINT=""

usage() {
    cat <<'EOF'
Usage:
  task-worktree.sh init <task-key> <slug> [--no-deps] [--no-build]
  task-worktree.sh recover <task-key> [--no-deps] [--no-build]
  task-worktree.sh remove <task-key> --abandoned
  task-worktree.sh preflight
  task-worktree.sh finish <task-key>
  task-worktree.sh with-integration-lock -- <command> [args...]
  task-worktree.sh --help

init claims a task: it creates .worktrees/<task-key> from origin/develop on the
branch feat/<task-key>-<slug> and prepares that worktree so the quality gate can
run inside it — the primary checkout's .env, then pnpm install and a build. The
task key is the Workspace key (SQST-0005); the slug is derived from the task
title by the caller. The primary checkout is never modified and nothing is
committed: the branch is the claim.

A checkout with no package.json yet — the repository before its scaffolding
task — skips the install and the build instead of failing: there is nothing to
install.

recover re-runs the environment preparation of an already claimed worktree. It
is the repair for an init that created the worktree and then failed installing.

remove requires the explicit --abandoned flag and never removes a worktree
carrying work, a branch published on origin or one with commits of its own.

preflight validates that the current directory is a task worktree of this
repository, on its feature branch, and reports the task key it belongs to.

finish runs the post-merge integration under the canonical integration lock: it
updates the primary checkout, regenerates the changelog there once, then removes
the completed worktree, its local branch and the branch it published on origin.
Merge the pull request with plain `gh pr merge --merge`: the --delete-branch
flag cannot run from a task worktree.
EOF
}

die() {
    local message="$1"
    local code="${2:-1}"

    printf '%s: %s\n' "$SCRIPT_NAME" "$message" >&2
    exit "$code"
}

absolute_path() {
    local path="$1"

    if [[ -d "$path" ]]; then
        (cd "$path" && pwd -P)
    else
        local parent
        parent="$(dirname "$path")"
        printf '%s/%s\n' "$(absolute_path "$parent")" "$(basename "$path")"
    fi
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

require_command git
require_command flock

# Every Git command runs inside the repository this script belongs to, so the
# caller's directory cannot redirect it at another checkout. The one command
# that legitimately cares where the agent stands — preflight — reads the
# directory captured here before the move.
caller_directory="$PWD"
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$script_directory/../.."
repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a Git repository"
repository_root="$(absolute_path "$repository_root")"
common_dir="$(git rev-parse --git-common-dir 2>/dev/null)" || die "cannot resolve Git common directory"
if [[ "$common_dir" != /* ]]; then
    common_dir="$repository_root/$common_dir"
fi
common_dir="$(absolute_path "$common_dir")"

primary_root=""
resolve_primary_root() {
    local line

    # `git worktree list` always reports the main worktree first.
    while IFS= read -r line; do
        case "$line" in
            worktree\ *)
                primary_root="$(absolute_path "${line#worktree }")"
                break
                ;;
        esac
    done < <(git worktree list --porcelain 2>/dev/null) || die "cannot enumerate Git worktrees"

    [[ -n "$primary_root" && -d "$primary_root" ]] || die "cannot resolve the primary checkout"
}

# Mutual exclusion comes from flock, not from an exclusive create.
#
# The obvious `mkdir` lock is not safe here: processes racing to create the same
# directory can produce several winners, so an exclusive-create lock would hand
# the same task to several agents at once. A kernel advisory lock has no such
# ambiguity, and it is released when the owner dies, which removes stale locks
# as a category instead of leaving them to be reaped by a PID check.
#
# The lock file itself only carries diagnostics: who holds it and what they are
# running, so a refusal can name the operation to wait for.
lock_acquire() {
    local lock_name="$1"
    local wait_seconds="$2"
    shift 2
    local lock_path="$common_dir/$lock_name"
    local owner_pid=""
    local owner_command=""

    eval "exec $LOCK_FD>>\"\$lock_path\"" || die "cannot open lock file: $lock_path"
    if ! flock -w "$wait_seconds" "$LOCK_FD"; then
        { IFS= read -r owner_pid || true; IFS= read -r owner_command || true; } < "$lock_path" 2>/dev/null || true
        die "active lock $lock_name is held by PID ${owner_pid:-unknown} (${owner_command:-command unavailable}); wait for it to finish" 2
    fi

    LOCK_FILE="$lock_path"
    printf '%s\n%s\n' "$$" "$(printf '%q ' "$SCRIPT_NAME" "$@")" > "$lock_path"
    trap lock_release EXIT
    trap 'on_interrupt 130' INT
    trap 'on_interrupt 143' TERM
    trap 'on_interrupt 129' HUP
}

lock_release() {
    if [[ -n "$LOCK_FILE" ]]; then
        : > "$LOCK_FILE"
        eval "exec $LOCK_FD>&-"
    fi
    LOCK_FILE=""
}

on_interrupt() {
    local exit_code="$1"

    lock_release
    trap - EXIT INT TERM HUP
    exit "$exit_code"
}

# Untracked files are left alone on purpose: the primary checkout regularly
# carries scratch notes, and refusing to prepare a task because of them would
# reintroduce the very friction worktrees remove.
validate_clean_checkout() {
    local checkout="$1"
    local label="$2"

    if [[ -n "$(git -C "$checkout" status --porcelain --untracked-files=no)" ]]; then
        die "$label has uncommitted changes: $checkout"
    fi
}

refresh_refs() {
    local remote

    printf '%s: refreshing origin refs\n' "$SCRIPT_NAME" >&2
    while IFS= read -r remote; do
        if ! git -C "$primary_root" fetch --prune "$remote" >&2; then
            if [[ "$remote" == origin ]]; then
                die "could not refresh required remote refs for $remote"
            fi
            printf '%s: warning: could not refresh optional remote refs for %s; using existing refs\n' "$SCRIPT_NAME" "$remote" >&2
        fi
    done < <(git -C "$primary_root" remote)
    git -C "$primary_root" show-ref --verify --quiet "refs/remotes/$BASE_REF" || die "$BASE_REF is unavailable"
}

# The Workspace key is the ownership key. It is lowercased for the branch and
# the directory, which is the form the repository already uses
# (feat/sqst-0005-...), so `SQST-5` and `sqst-5` can never claim the same task
# twice.
task_key_lower=""
validate_task_key() {
    local task_key="$1"

    [[ "$task_key" =~ ^[[:alnum:]]+-[0-9]+$ ]] || die "invalid task key: $task_key (expected something like SQST-0005)"
    task_key_lower="${task_key,,}"
}

# The slug comes from the task title and reaches a branch name and a path, so it
# is validated rather than sanitized: a caller that cannot produce a safe slug
# must be told, not silently given a different branch than it asked for.
validate_slug() {
    local slug="$1"

    [[ "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "invalid slug: $slug (lowercase letters, digits and hyphens only)"
    ((${#slug} <= 100)) || die "slug is too long: ${#slug} characters (maximum 100)"
}

branches_for_key() {
    local key_lower="$1"
    local ref_prefix="$2"
    local branch_ref
    local branch

    while IFS= read -r branch_ref; do
        case "$branch_ref" in
            refs/heads/feat/*) branch="${branch_ref#refs/heads/}" ;;
            refs/remotes/*/feat/*) branch="feat/${branch_ref#*/feat/}" ;;
            *) continue ;;
        esac
        if [[ "$branch" == "feat/$key_lower" || "$branch" == "feat/$key_lower-"* ]]; then
            printf '%s\n' "$branch"
        fi
    done < <(git -C "$primary_root" for-each-ref --format='%(refname)' "$ref_prefix")
}

worktree_for_branch() {
    local branch="$1"
    local path=""
    local current_branch=""
    local line

    while IFS= read -r line; do
        case "$line" in
            worktree\ *) path="${line#worktree }" ;;
            branch\ refs/heads/*) current_branch="${line#branch refs/heads/}" ;;
            '')
                if [[ "$current_branch" == "$branch" ]]; then
                    absolute_path "$path"
                fi
                path=""
                current_branch=""
                ;;
        esac
    done < <(git -C "$primary_root" worktree list --porcelain)
}

verify_expected_worktree_link() {
    local branch="$1"
    local expected_path="$2"
    local linked_path
    local linked_paths=()

    while IFS= read -r linked_path; do
        linked_paths+=("$linked_path")
    done < <(worktree_for_branch "$branch")

    if ((${#linked_paths[@]} != 1)) || [[ "${linked_paths[0]:-}" != "$expected_path" ]]; then
        die "branch $branch is not linked exclusively to expected worktree $expected_path" 2
    fi
}

# The key is the ownership key: a different slug does not make an already
# claimed task available again.
claim_is_free() {
    local key_lower="$1"
    local worktree_path="$2"
    local evidence
    local claimed=()

    while IFS= read -r evidence; do
        if [[ -n "$evidence" ]]; then
            claimed+=("$evidence")
        fi
    done < <(branches_for_key "$key_lower" refs/heads; branches_for_key "$key_lower" refs/remotes)
    ((${#claimed[@]} == 0)) || die "task $key_lower is already represented by branch ${claimed[0]}"

    [[ ! -e "$worktree_path" ]] || die "expected worktree path already exists: $worktree_path"
}

validate_derived_worktree_values() {
    local branch="$1"
    local worktree_path="$2"
    local worktree_parent="$3"
    local key_lower="$4"

    git check-ref-format --branch "$branch" >/dev/null 2>&1 || die "derived task branch is unsafe: $branch"
    case "$worktree_path" in
        "$worktree_parent"/*) ;;
        *) die "derived worktree path escapes .worktrees: $worktree_path" 2 ;;
    esac
    [[ "$(basename "$worktree_path")" == "$key_lower" ]] || die "derived worktree path does not match task ownership" 2
}

# Resolves the single local feature branch owned by a key.
resolve_task_branch() {
    local key_lower="$1"
    local branch
    local matches=()

    while IFS= read -r branch; do
        matches+=("$branch")
    done < <(branches_for_key "$key_lower" refs/heads)

    ((${#matches[@]} != 0)) || die "no local feature branch found for $key_lower" 2
    ((${#matches[@]} == 1)) || die "task $key_lower has ${#matches[@]} local feature branches; refusing an ambiguous operation" 2
    printf '%s\n' "${matches[0]}"
}

run_in_worktree() {
    local worktree_path="$1"
    local label="$2"
    local command="$3"

    if [[ -z "$command" ]]; then
        printf '%s: %s is disabled\n' "$SCRIPT_NAME" "$label" >&2

        return 0
    fi

    printf '%s: %s\n' "$SCRIPT_NAME" "$label" >&2
    (cd "$worktree_path" && eval "$command") >&2
}

# A worktree is a checkout without an environment: no .env and no node_modules,
# so `pnpm check` cannot run in it. Preparing it is therefore part of claiming
# the task and not a chore left to whoever walks in.
#
# The dependencies are installed rather than linked. A symlinked node_modules
# resolves to the primary checkout, so a worktree would run the primary's
# dependency tree — silently, and only sometimes differently. pnpm keeps a
# content-addressable store, so installing again costs little disk and little
# time.
#
# The .env is copied because Docker Compose reads it, and because a worktree
# that cannot reach the database cannot run the gate.
prepare_environment() {
    local worktree_path="$1"
    local install_dependencies="$2"
    local run_build="$3"

    if [[ ! -f "$worktree_path/.env" ]]; then
        if [[ -f "$primary_root/.env" ]]; then
            printf '%s: copying .env from the primary checkout\n' "$SCRIPT_NAME" >&2
            cp -- "$primary_root/.env" "$worktree_path/.env" \
                || die "could not copy .env into the worktree$RECOVERY_HINT"
        else
            printf '%s: warning: the primary checkout has no .env; the worktree has none either\n' "$SCRIPT_NAME" >&2
        fi
    fi

    # Before the scaffolding task there is no manifest to install from. Failing
    # here would make the first task of the project impossible to claim, so the
    # steps are skipped and said out loud.
    if [[ ! -f "$worktree_path/package.json" ]]; then
        printf '%s: no package.json in the worktree; skipping install and build\n' "$SCRIPT_NAME" >&2

        return 0
    fi

    if [[ "$install_dependencies" == true ]]; then
        run_in_worktree "$worktree_path" 'installing Node dependencies' "$PNPM_INSTALL_COMMAND" \
            || die "could not install Node dependencies in $worktree_path$RECOVERY_HINT"
    fi

    if [[ "$run_build" == true ]]; then
        run_in_worktree "$worktree_path" 'building the panel' "$BUILD_COMMAND" \
            || die "could not build the panel in $worktree_path$RECOVERY_HINT"
    fi
}

parse_preparation_flags() {
    install_dependencies=true
    run_build=true

    local flag

    for flag in "$@"; do
        case "$flag" in
            --no-deps) install_dependencies=false ;;
            --no-build) run_build=false ;;
            *) die "unknown option: $flag" ;;
        esac
    done
}

init_task() {
    local task_key="$1"
    shift
    local branch
    local worktree_path
    local worktree_parent
    local slug
    local install_dependencies
    local run_build

    validate_task_key "$task_key"
    slug="$1"
    shift
    validate_slug "$slug"
    parse_preparation_flags "$@"

    lock_acquire "$LOCK_NAME_INIT" "$LOCK_WAIT_SECONDS" init "$task_key"
    resolve_primary_root
    validate_clean_checkout "$primary_root" "primary checkout"
    refresh_refs

    branch="feat/$task_key_lower-$slug"
    worktree_parent="$primary_root/.worktrees"
    worktree_path="$(absolute_path "$worktree_parent/$task_key_lower")"
    validate_derived_worktree_values "$branch" "$worktree_path" "$worktree_parent" "$task_key_lower"
    claim_is_free "$task_key_lower" "$worktree_path"

    mkdir -p -- "$worktree_parent"
    printf '%s: creating %s from %s\n' "$SCRIPT_NAME" "$worktree_path" "$BASE_REF" >&2
    # --no-track, or the branch is created tracking origin/develop: `git status`
    # inside the worktree would report the task branch against the integration
    # branch, and a plain `git pull` there would merge develop into it. The
    # upstream it gets is the one `git push -u origin HEAD` sets when the work
    # is published.
    git -C "$primary_root" worktree add --no-track -b "$branch" "$worktree_path" "$BASE_REF" >&2 \
        || die "could not create task worktree"

    # The claim is complete once the branch and the worktree exist, and that is
    # all the lock protects. Installing dependencies takes minutes; holding the
    # lock through it would make every other agent's init time out on a step
    # that races with nothing.
    lock_release
    trap - EXIT INT TERM HUP

    RECOVERY_HINT="; the worktree is claimed, so repair it with: $SCRIPT_NAME recover $task_key"
    prepare_environment "$worktree_path" "$install_dependencies" "$run_build"
    RECOVERY_HINT=""

    printf 'SIDEQUEST_WORKTREE=%s\n' "$worktree_path"
    printf 'SIDEQUEST_BRANCH=%s\n' "$branch"
    printf 'cd %q\n' "$worktree_path" >&2
}

# Recovery only ever touches the expected worktree of the expected task, and it
# only ever rewrites files Git ignores, so it is safe to run over work in
# progress.
recover_task() {
    local task_key="$1"
    shift
    local branch
    local worktree_path
    local install_dependencies
    local run_build

    validate_task_key "$task_key"
    parse_preparation_flags "$@"

    lock_acquire "$LOCK_NAME_INIT" "$LOCK_WAIT_SECONDS" recover "$task_key"
    resolve_primary_root

    branch="$(resolve_task_branch "$task_key_lower")"
    worktree_path="$(absolute_path "$primary_root/.worktrees/$task_key_lower")"
    validate_derived_worktree_values "$branch" "$worktree_path" "$primary_root/.worktrees" "$task_key_lower"
    [[ -d "$worktree_path" ]] || die "expected worktree is missing: $worktree_path" 2
    verify_expected_worktree_link "$branch" "$worktree_path"

    lock_release
    trap - EXIT INT TERM HUP

    prepare_environment "$worktree_path" "$install_dependencies" "$run_build"

    printf 'SIDEQUEST_WORKTREE=%s\n' "$worktree_path"
    printf 'SIDEQUEST_BRANCH=%s\n' "$branch"
}

remove_abandoned() {
    local task_key="$1"
    local branch
    local worktree_path
    local subject

    [[ "${2:-}" == "--abandoned" ]] || die "removal requires the explicit --abandoned flag" 2
    validate_task_key "$task_key"
    lock_acquire "$LOCK_NAME_INIT" "$LOCK_WAIT_SECONDS" remove "$task_key"
    resolve_primary_root
    validate_clean_checkout "$primary_root" "primary checkout"

    branch="$(resolve_task_branch "$task_key_lower")"
    worktree_path="$(absolute_path "$primary_root/.worktrees/$task_key_lower")"
    validate_derived_worktree_values "$branch" "$worktree_path" "$primary_root/.worktrees" "$task_key_lower"
    [[ -d "$worktree_path" ]] || die "abandoned worktree does not exist: $worktree_path" 2
    verify_expected_worktree_link "$branch" "$worktree_path"

    # An abandoned worktree is one nobody worked in. Ignored files do not count
    # here, unlike everywhere else: init itself writes .env, node_modules/ and
    # the build output into every worktree it prepares, so their presence is
    # evidence of nothing.
    if [[ -n "$(git -C "$worktree_path" status --porcelain --untracked-files=all)" ]]; then
        die "refusing to remove a worktree with uncommitted work: $worktree_path" 2
    fi
    if git -C "$primary_root" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
        die "branch $branch is published on origin; remove it there first" 2
    fi

    while IFS= read -r subject; do
        [[ -z "$subject" ]] || die "refusing to remove a branch carrying commits: $subject" 2
    done < <(git -C "$primary_root" log --format=%s "$BASE_REF..$branch")

    remove_worktree "$worktree_path"
    git -C "$primary_root" branch -D "$branch" >&2 \
        || die "worktree removed but could not delete branch $branch; manual cleanup is required"

    printf 'SIDEQUEST_WORKTREE=%s\n' "$worktree_path"
}

# `--force` is what lets the prepared environment go with the worktree:
# node_modules/ and the build output are ignored files, and Git refuses to
# remove a worktree carrying them. Every caller has already run the stricter check of its
# own — no tracked change and no untracked source — before reaching here.
remove_worktree() {
    local worktree_path="$1"

    git -C "$primary_root" worktree remove --force "$worktree_path" >&2 \
        || die "could not remove worktree $worktree_path" 2
}

preflight() {
    local current_root
    local current_common
    local branch
    local task_slug
    local task_key
    local linked=false

    resolve_primary_root
    current_root="$(cd "$caller_directory" && git rev-parse --show-toplevel 2>/dev/null)" \
        || die "the current directory is not inside a Git repository: $caller_directory"
    current_root="$(absolute_path "$current_root")"
    current_common="$(cd "$caller_directory" && git rev-parse --path-format=absolute --git-common-dir)"
    [[ "$(absolute_path "$current_common")" == "$common_dir" ]] \
        || die "the current directory belongs to another repository: $current_root"

    branch="$(git -C "$current_root" branch --show-current)"
    [[ -n "$branch" ]] || die "HEAD is detached; check out the task branch first"
    case "$branch" in
        "$BASE_BRANCH"|staging|main) die "$branch is an integration branch, not a task branch" ;;
        feat/*) ;;
        *) die "current branch is not a feature branch: $branch" ;;
    esac

    task_slug="${branch#feat/}"
    [[ "$task_slug" =~ ^([[:alnum:]]+-[0-9]+)(-.*)?$ ]] \
        || die "cannot derive a task key from branch $branch"
    task_key="${BASH_REMATCH[1]^^}"

    if [[ "$current_root" != "$primary_root" ]]; then
        verify_expected_worktree_link "$branch" "$current_root"
        linked=true
    else
        printf '%s: standing in the primary checkout; no worktree is linked to this task\n' "$SCRIPT_NAME" >&2
    fi

    printf 'SIDEQUEST_WORKTREE=%s\n' "$current_root"
    printf 'SIDEQUEST_PRIMARY=%s\n' "$primary_root"
    printf 'SIDEQUEST_BRANCH=%s\n' "$branch"
    printf 'SIDEQUEST_TASK_KEY=%s\n' "$task_key"
    printf 'SIDEQUEST_LINKED=%s\n' "$linked"
}

# CHANGELOG.md is generated from changelog/, so it is regenerated once, on the
# primary checkout, after the merge — never on a feature branch, where two
# branches would conflict on the same generated lines.
regenerate_changelog() {
    if [[ -z "$CHANGELOG_COMMAND" ]]; then
        printf '%s: changelog regeneration is disabled\n' "$SCRIPT_NAME" >&2

        return 0
    fi

    printf '%s: regenerating the changelog\n' "$SCRIPT_NAME" >&2
    (cd "$primary_root" && eval "$CHANGELOG_COMMAND") >&2 || die "changelog regeneration failed"

    local path
    local paths=()

    for path in "${CHANGELOG_PATHS[@]}"; do
        if [[ -e "$primary_root/$path" ]]; then
            paths+=("$path")
        fi
    done
    ((${#paths[@]} != 0)) || return 0

    git -C "$primary_root" add -- "${paths[@]}" >&2 || die "could not stage the regenerated changelog"
    if git -C "$primary_root" diff --cached --quiet -- "${paths[@]}"; then
        return 0
    fi
    git -C "$primary_root" commit -m "chore: regenerate changelog" >&2 \
        || die "could not commit the regenerated changelog"
    git -C "$primary_root" push origin "$BASE_BRANCH" >&2 || die "could not push the regenerated changelog"
}

# Post-merge integration. Everything that touches shared state — the primary
# checkout, the generated changelog and worktree removal — happens while holding
# the one integration lock, so two closes cannot interleave.
finish_task() {
    local task_key="$1"
    local branch
    local worktree_path=""
    local linked_path
    local linked_paths=()

    validate_task_key "$task_key"
    lock_acquire "$LOCK_NAME_INTEGRATION" 0 finish "$task_key"
    resolve_primary_root
    # Standing inside the worktree that is about to be removed would break the
    # removal, so the command moves to the primary checkout first.
    cd "$primary_root"

    branch="$(resolve_task_branch "$task_key_lower")"
    while IFS= read -r linked_path; do
        linked_paths+=("$linked_path")
    done < <(worktree_for_branch "$branch")
    ((${#linked_paths[@]} < 2)) || die "branch $branch is linked to ${#linked_paths[@]} worktrees; refusing an ambiguous close" 2
    worktree_path="${linked_paths[0]:-}"
    refresh_refs

    git -C "$primary_root" merge-base --is-ancestor "$branch" "$BASE_REF" \
        || die "$branch is not merged into $BASE_REF yet; merge the pull request first"

    validate_clean_checkout "$primary_root" "primary checkout"
    if [[ "$(git -C "$primary_root" branch --show-current)" != "$BASE_BRANCH" ]]; then
        git -C "$primary_root" checkout "$BASE_BRANCH" >&2 || die "could not check out $BASE_BRANCH in the primary checkout"
    fi
    git -C "$primary_root" pull --ff-only origin "$BASE_BRANCH" >&2 || die "could not fast-forward $BASE_BRANCH"

    regenerate_changelog

    if [[ -n "$worktree_path" && "$worktree_path" != "$primary_root" ]]; then
        # Ignored build output and dependencies are expendable once the work is
        # merged, so only tracked changes and untracked sources block removal.
        if [[ -n "$(git -C "$worktree_path" status --porcelain --untracked-files=all)" ]]; then
            die "refusing to remove a worktree with uncommitted work: $worktree_path" 2
        fi
        remove_worktree "$worktree_path"
    fi
    if git -C "$primary_root" show-ref --verify --quiet "refs/heads/$branch"; then
        git -C "$primary_root" branch -D "$branch" >&2 || die "could not delete the merged branch $branch"
    fi

    # The published branch is deleted here and not by `gh pr merge
    # --delete-branch`: to drop the local branch gh checks out the base branch
    # first, and develop belongs to the primary checkout, so from a task
    # worktree it aborts and leaves the branch standing on origin. Deleting it
    # is safe at this point — the merge check above already proved the branch is
    # an ancestor of the base ref. A failure here is reported and does not fail
    # the integration: everything that had to land has landed.
    if git -C "$primary_root" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
        git -C "$primary_root" push origin --delete "$branch" >&2 \
            || printf '%s: warning: could not delete origin/%s; delete it by hand\n' "$SCRIPT_NAME" "$branch" >&2
    fi

    printf 'SIDEQUEST_PRIMARY=%s\n' "$primary_root"
    printf 'cd %q\n' "$primary_root" >&2
}

with_integration_lock() {
    [[ "${1:-}" == "--" ]] || die "with-integration-lock requires -- before the command"
    shift
    (($# > 0)) || die "with-integration-lock requires a command"
    lock_acquire "$LOCK_NAME_INTEGRATION" 0 "$@"
    "$@"
}

main() {
    case "${1:-}" in
        init)
            (($# >= 3)) || die "usage: $SCRIPT_NAME init <task-key> <slug> [--no-deps] [--no-build]"
            init_task "${@:2}"
            ;;
        recover)
            (($# >= 2)) || die "usage: $SCRIPT_NAME recover <task-key> [--no-deps] [--no-build]"
            recover_task "${@:2}"
            ;;
        remove)
            (($# == 3)) || die "usage: $SCRIPT_NAME remove <task-key> --abandoned"
            remove_abandoned "$2" "$3"
            ;;
        preflight)
            (($# == 1)) || die "usage: $SCRIPT_NAME preflight"
            preflight
            ;;
        finish)
            (($# == 2)) || die "usage: $SCRIPT_NAME finish <task-key>"
            finish_task "$2"
            ;;
        with-integration-lock)
            with_integration_lock "${@:2}"
            ;;
        --help|-h|"")
            usage
            ;;
        *)
            usage >&2
            die "unknown command: $1"
            ;;
    esac
}

main "$@"
