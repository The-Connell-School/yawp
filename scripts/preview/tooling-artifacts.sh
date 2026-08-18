#!/usr/bin/env bash

preview_missing_tooling_artifacts() {
  local source_dir="$1"
  local dependencies_external="${2:-false}"

  if [[ "$dependencies_external" != "true" ]]; then
    if [[ ! -d "$source_dir/node_modules" ]]; then
      echo "node_modules"
    fi

    if [[ ! -d "$source_dir/services/web-app/node_modules" ]]; then
      echo "services/web-app/node_modules"
    fi
  fi

  if [[ ! -f "$source_dir/packages/prisma/generated/prisma/index.js" ]]; then
    echo "packages/prisma/generated/prisma/index.js"
  fi
}

preview_tooling_artifacts_ready() {
  local source_dir="$1"
  [[ -z "$(preview_missing_tooling_artifacts "$source_dir")" ]]
}
