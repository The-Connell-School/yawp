#!/usr/bin/env bash
# Pipe plain-format pg_dump (stdout) into a local psql session.
# Strips pg_dump 18+ meta-commands and PG17+ GUCs that Postgres 14 rejects.
#
# Usage: something_that_emits_sql | pg_dump_plain_pipe_to_psql "$DATABASE_URL"
pg_dump_plain_pipe_to_psql() {
  local db_url="$1"
  sed -e '/^\\restrict/d' -e '/^\\unrestrict/d' -e '/^SET transaction_timeout/d' \
    | psql "${db_url}" -v ON_ERROR_STOP=1
}
