#!/usr/bin/env bash
# Start backend (uvicorn + alembic migrations) and frontend (vite) in dev mode.
# Run from repo root: ./dev.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_BLUE=$'\033[34m'; C_MAGENTA=$'\033[35m'; C_RED=$'\033[31m'
else
  C_RESET=""; C_BOLD=""; C_BLUE=""; C_MAGENTA=""; C_RED=""
fi

err() { printf "${C_RED}error:${C_RESET} %s\n" "$1" >&2; }

# --- preflight ---------------------------------------------------------------
if [ ! -f "$ROOT/backend/.env" ]; then
  err "backend/.env not found. Run ./setup.sh first."
  exit 1
fi
if [ ! -f "$ROOT/frontend/.env" ]; then
  err "frontend/.env not found. Run ./setup.sh first."
  exit 1
fi
if [ ! -d "$ROOT/backend/.venv" ]; then
  err "backend/.venv not found. Run ./setup.sh first."
  exit 1
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  err "frontend/node_modules not found. Run ./setup.sh first."
  exit 1
fi

# --- start servers -----------------------------------------------------------
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  printf "\n${C_BOLD}Stopping...${C_RESET}\n"
  if [ -n "$BACKEND_PID" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
  if [ -n "$FRONTEND_PID" ]; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

prefix() {
  local color="$1" tag="$2"
  while IFS= read -r line; do
    printf "${color}[%s]${C_RESET} %s\n" "$tag" "$line"
  done
}

(
  cd "$ROOT/backend"
  # shellcheck disable=SC1091
  source .venv/bin/activate
  alembic upgrade head 2>&1
  exec uvicorn main:app --reload --host 0.0.0.0 --port 8000 2>&1
) | prefix "$C_BLUE" "backend " &
BACKEND_PID=$!

(
  cd "$ROOT/frontend"
  exec npm run dev 2>&1
) | prefix "$C_MAGENTA" "frontend" &
FRONTEND_PID=$!

printf "${C_BOLD}Backend:${C_RESET}  http://localhost:8000\n"
printf "${C_BOLD}Frontend:${C_RESET} http://localhost:5173\n"
printf "Press Ctrl+C to stop.\n\n"

wait
