#!/usr/bin/env bash
# Valida migrações + regras de negócio/RLS em um PostgreSQL local descartável (sem Supabase).
# Uso: supabase/tests/run_local.sh   (requer PostgreSQL 16 instalado e permissão para iniciar o cluster)
set -euo pipefail
cd "$(dirname "$0")/.."
psql() { if [ -z "${CI_PG:-}" ] && [ "$(id -u)" = 0 ]; then runuser -u postgres -- env PGDATABASE="${PGDATABASE:-postgres}" psql "$@"; else command psql "$@"; fi; }
if [ -z "${CI_PG:-}" ]; then (pg_lsclusters | grep -q online) || pg_ctlcluster 16 main start; sleep 2; fi
psql -qAt -c "drop database if exists muvens_test with (force)" -c "create database muvens_test" postgres >/dev/null
export PGDATABASE=muvens_test
psql -q -v ON_ERROR_STOP=1 < tests/local_stub.sql
for f in migrations/*.sql; do echo ">> $f"; psql -q -v ON_ERROR_STOP=1 < "$f"; done
psql -q -o /dev/null -v ON_ERROR_STOP=1 < tests/rules.test.sql
psql -q -o /dev/null -v ON_ERROR_STOP=1 < tests/contracts.test.sql
psql -q -o /dev/null -v ON_ERROR_STOP=1 < tests/projects.test.sql
psql -q -o /dev/null -v ON_ERROR_STOP=1 < tests/brand.test.sql
psql -q -o /dev/null -v ON_ERROR_STOP=1 < tests/portal.test.sql
echo "OK — todos os testes SQL passaram"
