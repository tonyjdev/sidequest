#!/usr/bin/env bash

# Source this file from an interactive Bash shell:
#
#   source /absolute/path/to/sidequest/scripts/git/task-worktree-functions.sh
#
# The CLI remains usable on its own; these functions add the one thing a child
# process cannot do — change the directory of the shell that called it.

task_worktree_functions_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
task_worktree_cli="$task_worktree_functions_directory/task-worktree.sh"

# Reads a single `KEY=value` line out of the CLI's machine-readable stdout and
# rejects anything that is not exactly one absolute path.
task_worktree_read_path() {
    local key="$1"
    local output="$2"

    printf '%s\n' "$output" | awk -v key="$key" '
        index($0, key "=") == 1 {
            count++
            value = substr($0, length(key) + 2)
            if (value !~ /^\// || value ~ /[[:space:]]/ || value == "") {
                invalid = 1
            } else {
                path = value
            }
        }
        END {
            if (count != 1 || invalid) exit 1
            print path
        }
    '
}

task_worktree_primary_root() {
    local worktree_path=""
    local line

    while IFS= read -r line; do
        case "$line" in
            worktree\ *)
                worktree_path="${line#worktree }"
                break
                ;;
        esac
    done < <(git worktree list --porcelain) || return 1

    [[ -n "$worktree_path" && -d "$worktree_path" ]] || return 1
    (cd "$worktree_path" && pwd -P)
}

init-task() {
    local output
    local worktree_path

    if [[ "$#" -lt 2 ]]; then
        printf 'Usage: init-task <task-key> <slug> [--no-deps] [--no-build]\n' >&2

        return 2
    fi

    output="$("$task_worktree_cli" init "$@")" || return $?

    worktree_path="$(task_worktree_read_path SIDEQUEST_WORKTREE "$output")" || {
        printf 'init-task: CLI did not return a valid SIDEQUEST_WORKTREE path\n' >&2

        return 1
    }

    if [[ ! -d "$worktree_path" ]]; then
        printf 'init-task: CLI returned a missing worktree path: %s\n' "$worktree_path" >&2

        return 1
    fi

    cd -- "$worktree_path" || return 1
}

finish-task() {
    local output
    local primary_root

    if [[ "$#" -ne 1 ]]; then
        printf 'Usage: finish-task <task-key>\n' >&2

        return 2
    fi

    output="$("$task_worktree_cli" finish "$1")" || return $?

    primary_root="$(task_worktree_read_path SIDEQUEST_PRIMARY "$output")" || {
        printf 'finish-task: CLI did not return a valid SIDEQUEST_PRIMARY path\n' >&2

        return 1
    }

    cd -- "$primary_root" || return 1
}

# Runs a closing command and, only when it succeeds, returns the terminal to the
# primary checkout — the task worktree may no longer exist by then.
close-task() {
    local status
    local primary_root

    if [[ "$#" -eq 0 ]]; then
        primary_root="$(task_worktree_primary_root)" || {
            printf 'close-task: cannot resolve the primary checkout\n' >&2

            return 1
        }
        cd -- "$primary_root" || return 1

        return 0
    fi

    "$@"
    status=$?
    if [[ "$status" -eq 0 ]]; then
        primary_root="$(task_worktree_primary_root)" || return "$status"
        cd -- "$primary_root" || return "$status"
    fi

    return "$status"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    printf 'Source %s to use init-task, finish-task and close-task in the caller shell.\n' "$0" >&2
    exec "$task_worktree_cli" "$@"
fi
