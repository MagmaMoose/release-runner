#!/usr/bin/env bash
set -euo pipefail

branch="${GITHUB_HEAD_REF:-}"
PROMOTE_PREFIX="${PROMOTE_BRANCH_PREFIX:-promote}"
allowed="^(feat|fix|chore|hotfix|docs|refactor|perf|test|ci|style|${PROMOTE_PREFIX})/"

if [[ -z "${branch}" ]]; then
  echo "::error::GITHUB_HEAD_REF is empty; branch naming can only be checked on pull_request events."
  exit 1
fi

if [[ "${branch}" =~ ${allowed} ]]; then
  echo "Branch '${branch}' follows TBD naming convention."
else
  echo "::error::Branch '${branch}' does not follow TBD naming convention."
  echo "::error::Expected format: <type>/<description>"
  echo "::error::Allowed types: feat, fix, chore, hotfix, docs, refactor, perf, test, ci, style"
  exit 1
fi
