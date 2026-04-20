#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${1:-full_application_backend:smoke}"
NETWORK="backend_smoke_net"
PG_CONTAINER="backend_smoke_pg"
API_CONTAINER="backend_smoke_api"
PG_PASSWORD="smokepass"
PG_DB="myapp_db"
PG_USER="postgres"
API_PORT="3000"

cleanup() {
  docker rm -f "$API_CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}

trap cleanup EXIT

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_cmd docker
require_cmd curl

echo "[1/6] Building image: $IMAGE_TAG"
docker build -t "$IMAGE_TAG" ./old_backend

echo "[2/6] Creating isolated Docker network"
docker network create "$NETWORK" >/dev/null

echo "[3/6] Starting PostgreSQL test container"
docker run -d \
  --name "$PG_CONTAINER" \
  --network "$NETWORK" \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -e POSTGRES_DB="$PG_DB" \
  -e POSTGRES_USER="$PG_USER" \
  postgres:14-alpine >/dev/null

echo "[4/6] Starting backend container with DATABASE_URL"
docker run -d \
  --name "$API_CONTAINER" \
  --network "$NETWORK" \
  -e DATABASE_URL="postgresql://$PG_USER:$PG_PASSWORD@$PG_CONTAINER:5432/$PG_DB" \
  -p "$API_PORT:3000" \
  "$IMAGE_TAG" >/dev/null

echo "[5/6] Waiting for backend health"
for i in $(seq 1 40); do
  if curl -fsS "http://localhost:$API_PORT/health" >/dev/null; then
    break
  fi
  sleep 2
  if [[ "$i" -eq 40 ]]; then
    echo "Backend did not become healthy in time"
    docker logs "$API_CONTAINER" || true
    exit 1
  fi
done

echo "[6/6] Running API smoke tests"
health_json="$(curl -fsS "http://localhost:$API_PORT/health")"
echo "Health: $health_json"

create_json="$(curl -fsS -X POST "http://localhost:$API_PORT/api/users" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke User","email":"smoke@example.com"}')"
echo "Create: $create_json"

list_json="$(curl -fsS "http://localhost:$API_PORT/api/users")"
echo "List: $list_json"

echo "Smoke test passed: image builds and backend works with PostgreSQL DATABASE_URL"
