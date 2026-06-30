#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Reset a Git repository to a single fresh commit, delete old tags, and create a new tag.

This rewrites history. Run --dry-run first.

Usage:
  scripts/reset-repo-history.sh --tag v0.1.0 [options]

Required:
  --tag <tag>              Tag to create on the new initial commit.

Options:
  --remote <name>          Remote name. Default: origin
  --branch <name>          Branch to replace. Default: current branch
  --message <text>         New initial commit message. Default: Initial commit
  --dry-run                Print the planned operation without changing anything. Default
  --execute                Actually rewrite history and push changes
  --backup                 Create a git bundle backup before rewriting. Default
  --no-backup              Skip backup creation
  --skip-remote            Do not delete remote tags or push branch/tag
  --keep-tags              Keep existing tags instead of deleting all tags first
  --force                  Use git push --force instead of --force-with-lease
  -h, --help               Show this help

Examples:
  scripts/reset-repo-history.sh --tag v0.1.0 --dry-run
  scripts/reset-repo-history.sh --tag v0.1.0 --execute
  scripts/reset-repo-history.sh --tag v0.1.0 --branch main --remote origin --execute
  scripts/reset-repo-history.sh --tag v0.1.0 --skip-remote --execute

Notes:
  - The working tree must be clean when using --execute.
  - Remote branch protection can block the force push.
  - GitHub Releases may need to be deleted manually after tag deletion.
  - refs/tags/<tag>^{} entries from git ls-remote are peeled annotated tags,
    not separate tags. This script only reads real tag refs with --refs.
EOF
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

print_cmd() {
  printf '+'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'
}

run_cmd() {
  print_cmd "$@"
  "$@"
}

current_branch() {
  git symbolic-ref --quiet --short HEAD 2>/dev/null || true
}

list_local_tags() {
  git tag --list
}

list_remote_tags() {
  git ls-remote --tags --refs "$remote" | awk '{ sub("^refs/tags/", "", $2); print $2 }'
}

remote_branch_sha() {
  git ls-remote --heads "$remote" "$branch" | awk 'NR == 1 { print $1 }'
}

ensure_clean_worktree() {
  if [ -n "$(git status --porcelain)" ]; then
    git status --short >&2
    die "working tree is not clean; commit or stash changes before rewriting history"
  fi
}

tag=""
remote="origin"
branch=""
message="Initial commit"
mode="dry-run"
backup=true
skip_remote=false
delete_tags=true
push_mode="force-with-lease"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag)
      [ "$#" -ge 2 ] || die "--tag requires a value"
      tag="$2"
      shift 2
      ;;
    --remote)
      [ "$#" -ge 2 ] || die "--remote requires a value"
      remote="$2"
      shift 2
      ;;
    --branch)
      [ "$#" -ge 2 ] || die "--branch requires a value"
      branch="$2"
      shift 2
      ;;
    --message)
      [ "$#" -ge 2 ] || die "--message requires a value"
      message="$2"
      shift 2
      ;;
    --dry-run)
      mode="dry-run"
      shift
      ;;
    --execute)
      mode="execute"
      shift
      ;;
    --backup)
      backup=true
      shift
      ;;
    --no-backup)
      backup=false
      shift
      ;;
    --skip-remote)
      skip_remote=true
      shift
      ;;
    --keep-tags)
      delete_tags=false
      shift
      ;;
    --force)
      push_mode="force"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

[ -n "$tag" ] || die "--tag is required"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a Git worktree"
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

[ -n "$branch" ] || branch="$(current_branch)"
[ -n "$branch" ] || die "could not detect current branch; pass --branch explicitly"

git check-ref-format "refs/tags/$tag" || die "invalid tag name: $tag"
git check-ref-format "refs/heads/$branch" || die "invalid branch name: $branch"

if [ "$skip_remote" = false ]; then
  git remote get-url "$remote" >/dev/null || die "remote not found: $remote"
fi

if [ "$mode" = "execute" ]; then
  ensure_clean_worktree
elif [ -n "$(git status --porcelain)" ]; then
  printf 'warning: working tree is not clean; --execute would fail until it is clean\n' >&2
fi

head_sha="$(git rev-parse --short HEAD)"
current="$(current_branch)"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_path="$(dirname "$repo_root")/$(basename "$repo_root")-history-backup-$timestamp.bundle"
local_tags="$(list_local_tags || true)"
remote_tags=""
remote_head=""

if [ "$skip_remote" = false ]; then
  remote_tags="$(list_remote_tags)" || die "could not list remote tags from: $remote"
  remote_head="$(remote_branch_sha)" || die "could not read remote branch from: $remote"
fi

cat <<EOF
Repository: $repo_root
Current branch: ${current:-detached}
Current HEAD: $head_sha
Target branch: $branch
New tag: $tag
Commit message: $message
Mode: $mode
Backup: $backup
Delete existing tags: $delete_tags
Remote: $([ "$skip_remote" = true ] && printf 'skipped' || printf '%s' "$remote")
Push mode: $push_mode

Local tags:
${local_tags:-  (none)}
EOF

if [ "$skip_remote" = false ]; then
  cat <<EOF

Remote tags:
${remote_tags:-  (none)}

Remote $branch HEAD:
${remote_head:-  (not found)}
EOF
fi

cat <<EOF

Planned actions:
EOF

if [ "$backup" = true ]; then
  print_cmd git bundle create "$backup_path" --all --tags
fi

if [ "$delete_tags" = true ]; then
  if [ "$skip_remote" = false ]; then
    for existing_tag in $remote_tags; do
      print_cmd git push "$remote" ":refs/tags/$existing_tag"
    done
  fi
  for existing_tag in $local_tags; do
    print_cmd git tag -d "$existing_tag"
  done
fi

temp_branch="reset-history-$timestamp"
print_cmd git checkout --orphan "$temp_branch"
print_cmd git add -A
print_cmd git commit -m "$message"
print_cmd git branch -M "$branch"
print_cmd git tag -a "$tag" -m "$tag"

if [ "$skip_remote" = false ]; then
  if [ "$push_mode" = "force" ]; then
    print_cmd git push --force "$remote" "$branch"
  elif [ -n "$remote_head" ]; then
    print_cmd git push "--force-with-lease=refs/heads/$branch:$remote_head" "$remote" "$branch"
  else
    print_cmd git push --force-with-lease "$remote" "$branch"
  fi
  print_cmd git push "$remote" "$tag"
fi

if [ "$mode" != "execute" ]; then
  cat <<'EOF'

Dry run only. Re-run with --execute to perform these actions.
EOF
  exit 0
fi

cat <<'EOF'

Executing history rewrite...
EOF

if [ "$backup" = true ]; then
  run_cmd git bundle create "$backup_path" --all --tags
fi

if [ "$delete_tags" = true ]; then
  if [ "$skip_remote" = false ]; then
    for existing_tag in $remote_tags; do
      run_cmd git push "$remote" ":refs/tags/$existing_tag"
    done
  fi
  for existing_tag in $local_tags; do
    run_cmd git tag -d "$existing_tag"
  done
fi

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  die "tag already exists after tag cleanup: $tag"
fi

run_cmd git checkout --orphan "$temp_branch"
run_cmd git add -A
run_cmd git commit -m "$message"
run_cmd git branch -M "$branch"
run_cmd git tag -a "$tag" -m "$tag"

if [ "$skip_remote" = false ]; then
  if [ "$push_mode" = "force" ]; then
    run_cmd git push --force "$remote" "$branch"
  elif [ -n "$remote_head" ]; then
    run_cmd git push "--force-with-lease=refs/heads/$branch:$remote_head" "$remote" "$branch"
  else
    run_cmd git push --force-with-lease "$remote" "$branch"
  fi
  run_cmd git push "$remote" "$tag"
fi

cat <<'EOF'

Done. Verification:
EOF

run_cmd git log --oneline --decorate -5
run_cmd git tag --list
if [ "$skip_remote" = false ]; then
  run_cmd git ls-remote --heads "$remote" "$branch"
  run_cmd git ls-remote --tags --refs "$remote"
fi
