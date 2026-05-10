#!/usr/bin/env bash
# Interactive setup: prompts for tokens, writes .env files, installs deps.
# Run from repo root: ./setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ENV="$ROOT/backend/.env"
FRONTEND_ENV="$ROOT/frontend/.env"

# --- pretty output -----------------------------------------------------------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi

section() { printf "\n${C_BOLD}${C_BLUE}== %s ==${C_RESET}\n" "$1"; }
ok()      { printf "${C_GREEN}\xe2\x9c\x93${C_RESET} %s\n" "$1"; }
warn()    { printf "${C_YELLOW}!${C_RESET} %s\n" "$1"; }
err()     { printf "${C_RED}\xe2\x9c\x97${C_RESET} %s\n" "$1" >&2; }

# --- helpers -----------------------------------------------------------------
# prompt VAR_NAME "Description" "default" [secret=0|1]
prompt() {
  local var_name="$1" desc="$2" default="${3:-}" secret="${4:-0}"
  local current="${!var_name:-}"
  local shown_default="${current:-$default}"
  local input

  if [ "$secret" = "1" ] && [ -n "$shown_default" ]; then
    local masked="********"
    printf "${C_BOLD}%s${C_RESET} ${C_DIM}(%s)${C_RESET}\n" "$desc" "$var_name"
    printf "  [keep current: %s] " "$masked"
    if [ "$secret" = "1" ]; then
      read -rs input; echo
    else
      read -r input
    fi
  else
    printf "${C_BOLD}%s${C_RESET} ${C_DIM}(%s)${C_RESET}\n" "$desc" "$var_name"
    if [ -n "$shown_default" ]; then
      printf "  [default: %s] " "$shown_default"
    else
      printf "  > "
    fi
    if [ "$secret" = "1" ]; then
      read -rs input; echo
    else
      read -r input
    fi
  fi

  if [ -z "$input" ]; then
    eval "$var_name=\"\$shown_default\""
  else
    eval "$var_name=\"\$input\""
  fi
}

confirm() {
  local prompt_text="$1" default="${2:-y}" reply
  local hint="[Y/n]"; [ "$default" = "n" ] && hint="[y/N]"
  printf "%s %s " "$prompt_text" "$hint"
  read -r reply
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy] ]]
}

# Load existing .env so re-running this script keeps current values as defaults.
load_env() {
  local file="$1"
  [ -f "$file" ] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

# --- prerequisites -----------------------------------------------------------
section "Checking prerequisites"
missing=0
for cmd in python3 node npm; do
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$cmd $($cmd --version 2>&1 | head -1)"
  else
    err "$cmd not found"
    missing=1
  fi
done
if [ "$missing" = "1" ]; then
  err "Install missing tools and re-run."
  exit 1
fi

# --- load existing config (if any) -------------------------------------------
load_env "$BACKEND_ENV"
load_env "$FRONTEND_ENV"

# --- prompts -----------------------------------------------------------------
section "Twilio"
echo "Get these from https://console.twilio.com"
prompt TWILIO_ACCOUNT_SID  "Account SID"     "${TWILIO_ACCOUNT_SID:-}"
prompt TWILIO_AUTH_TOKEN   "Auth Token"      "${TWILIO_AUTH_TOKEN:-}"           1
prompt TWILIO_PHONE_NUMBER "Phone number (E.164, e.g. +14155551234)" "${TWILIO_PHONE_NUMBER:-}"

section "App URLs"
prompt APP_BASE_URL "Backend URL (use ngrok HTTPS for dev)" "${APP_BASE_URL:-http://localhost:8000}"
prompt PUBLIC_URL   "Public URL for Twilio WS callbacks"     "${PUBLIC_URL:-$APP_BASE_URL}"
prompt FRONTEND_URL "Frontend URL"                           "${FRONTEND_URL:-http://localhost:5173}"
prompt CORS_ORIGINS "Allowed origins (comma-separated)"      "${CORS_ORIGINS:-http://localhost:5173,http://localhost:5174}"

section "Database"
echo "Format: postgresql://user:password@host:5432/dbname"
prompt DATABASE_URL "PostgreSQL connection string" "${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/frontline_ai}"

section "Google AI / Gemini"
echo "Get an API key at https://aistudio.google.com/apikey"
prompt GEMINI_API_KEY "Gemini API key" "${GEMINI_API_KEY:-}" 1

section "Google OAuth (sign-in + Calendar)"
echo "Create at https://console.cloud.google.com/apis/credentials"
echo "Add redirect URIs: ${APP_BASE_URL}/auth/callback and ${APP_BASE_URL}/auth/calendar/callback"
prompt GOOGLE_CLIENT_ID     "Client ID"     "${GOOGLE_CLIENT_ID:-}"
prompt GOOGLE_CLIENT_SECRET "Client secret" "${GOOGLE_CLIENT_SECRET:-}" 1

if [ -z "${JWT_SECRET:-}" ]; then
  JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  ok "Generated random JWT_SECRET"
else
  if confirm "Existing JWT_SECRET found. Keep it? (rotating invalidates all sessions)" y; then
    :
  else
    JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
    ok "Generated new JWT_SECRET"
  fi
fi

section "Email / SMTP (optional — press Enter to skip)"
echo "For Gmail, create an App Password at https://myaccount.google.com/apppasswords"
prompt SMTP_HOST "SMTP host" "${SMTP_HOST:-smtp.gmail.com}"
prompt SMTP_PORT "SMTP port" "${SMTP_PORT:-587}"
prompt SMTP_USER "SMTP user (e.g. you@gmail.com)" "${SMTP_USER:-}"
prompt SMTP_PASS "SMTP password / app password"   "${SMTP_PASS:-}" 1

# --- write backend/.env ------------------------------------------------------
section "Writing config"

cat > "$BACKEND_ENV" <<EOF
# Generated by setup.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Twilio
TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER=$TWILIO_PHONE_NUMBER

# App URLs
APP_BASE_URL=$APP_BASE_URL
PUBLIC_URL=$PUBLIC_URL
FRONTEND_URL=$FRONTEND_URL
CORS_ORIGINS=$CORS_ORIGINS

# Database
DATABASE_URL=$DATABASE_URL

# Gemini
GEMINI_API_KEY=$GEMINI_API_KEY
SILENCE_DURATION_MS=${SILENCE_DURATION_MS:-250}
END_SPEECH_SENSITIVITY=${END_SPEECH_SENSITIVITY:-LOW}
START_SPEECH_SENSITIVITY=${START_SPEECH_SENSITIVITY:-HIGH}

# Google OAuth
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
JWT_SECRET=$JWT_SECRET

# SMTP
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
EOF
chmod 600 "$BACKEND_ENV"
ok "Wrote $BACKEND_ENV"

# --- write frontend/.env -----------------------------------------------------
cat > "$FRONTEND_ENV" <<EOF
VITE_API_BASE=$APP_BASE_URL
EOF
ok "Wrote $FRONTEND_ENV"

# --- install deps ------------------------------------------------------------
if confirm "Install backend Python dependencies (creates .venv)?" y; then
  section "Backend deps"
  cd "$ROOT/backend"
  if [ ! -d .venv ]; then
    python3 -m venv .venv
    ok "Created .venv"
  fi
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt
  ok "Installed Python deps"
  deactivate
  cd "$ROOT"
fi

if confirm "Install frontend Node dependencies?" y; then
  section "Frontend deps"
  cd "$ROOT/frontend"
  npm install --silent
  ok "Installed Node deps"
  cd "$ROOT"
fi

# --- done --------------------------------------------------------------------
section "Setup complete"
echo "Next:"
echo "  ${C_BOLD}./dev.sh${C_RESET}                # start backend + frontend"
echo "  ${C_BOLD}ngrok http 8000${C_RESET}         # expose backend for Twilio"
echo "  Edit ${C_BOLD}backend/.env${C_RESET} to tweak APP_BASE_URL/PUBLIC_URL after starting ngrok"

if confirm "Start the app now?" n; then
  exec "$ROOT/dev.sh"
fi
