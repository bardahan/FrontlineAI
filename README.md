# FrontlineAI — Bilingual AI Phone Receptionist

A full-stack AI phone receptionist system. Unanswered calls are forwarded to an AI agent (Hebrew + English) powered by Gemini Live. Post-call transcripts and caller info are stored in PostgreSQL and displayed in a React dashboard. Calendar integration via Google OAuth lets the agent book appointments.

## Architecture

```
Incoming Call → Twilio → Ring personal number (timeout)
                              ├── Answered: connect directly
                              └── No answer: Gemini Live AI handles call
                                           → Post-call webhook → DB
                                           → React Dashboard
```

## Prerequisites

You'll need accounts for the external services this app integrates with:

| Service | What you need | Where |
|---|---|---|
| **Twilio** | Account SID, Auth Token, a phone number | https://console.twilio.com |
| **Google AI (Gemini)** | API key | https://aistudio.google.com/apikey |
| **Google Cloud OAuth** | OAuth 2.0 Client ID + Secret (for Calendar tools) | https://console.cloud.google.com/apis/credentials |
| **Gmail App Password** | 16-char app password (for SMTP notifications, optional) | https://myaccount.google.com/apppasswords |
| **ngrok** (dev only) | Free account, exposes your local backend to Twilio | https://ngrok.com |

## Setup

### Quick start (recommended)

```bash
./setup.sh   # interactive: prompts for tokens, writes .env files, installs deps
./dev.sh     # starts backend (with migrations) + frontend
```

`setup.sh` is idempotent — re-run it anytime to update credentials. It auto-generates a random `JWT_SECRET` and only prints next steps; you start the app with `./dev.sh`.

### Manual setup

If you'd rather configure by hand:

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then edit .env with your credentials
alembic upgrade head
uvicorn main:app --reload --port 8000

# Frontend (in another terminal)
cd frontend
cp .env.example .env
npm install
npm run dev   # http://localhost:5173
```

### Expose Backend for Twilio (Development)

```bash
ngrok http 8000
# Copy the HTTPS URL and set APP_BASE_URL + PUBLIC_URL in backend/.env
```

### Configure Twilio

In your [Twilio Console](https://console.twilio.com):
- Open your phone number's settings
- Set the **Voice webhook** (when a call comes in) to:
  ```
  POST https://<your-ngrok-domain>/twilio/incoming
  ```

### Configure the Agent

1. Open `http://localhost:5173`
2. Sign in with Google (OAuth)
3. Fill in your personal number, system prompt, voice, and greeting
4. Click **Save Settings**

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for the full list with comments. Summary:

| Variable | Required | Description |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | yes | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | yes | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | yes | Your Twilio phone number (E.164) |
| `APP_BASE_URL` | yes | Public HTTPS URL of backend (ngrok or production) |
| `PUBLIC_URL` | yes | Public URL Twilio uses for webhook callbacks |
| `FRONTEND_URL` | yes | Where the React dashboard is served |
| `CORS_ORIGINS` | yes | Comma-separated frontend origins |
| `DATABASE_URL` | yes | Postgres connection string (`postgresql://user:pass@host:5432/db`) |
| `GEMINI_API_KEY` | yes | Google AI Studio API key |
| `GOOGLE_CLIENT_ID` | yes | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | yes | OAuth client secret |
| `JWT_SECRET` | yes | 32-byte hex for session signing |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | optional | Email notifications |
| `SILENCE_DURATION_MS` / `END_SPEECH_SENSITIVITY` / `START_SPEECH_SENSITIVITY` | optional | Gemini Live VAD tuning |

Frontend (`frontend/.env`):

| Variable | Description |
|---|---|
| `VITE_API_BASE` | Backend URL (leave empty for same-origin behind nginx) |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/auth/login` | Start Google OAuth |
| GET | `/auth/callback` | OAuth redirect handler |
| GET | `/auth/me` | Current user |
| POST | `/auth/logout` | Sign out |
| POST | `/twilio/incoming` | Twilio webhook — entry point for incoming calls |
| GET | `/api/settings` | Get current settings |
| PUT | `/api/settings` | Update settings |
| POST | `/api/settings/claim-twilio-number` | Attach a Twilio number to this account |
| GET | `/api/gemini-voices` | List available Gemini voices |
| GET | `/api/voice-preview` | Preview a voice |
| GET | `/api/twilio-numbers` | List numbers in your Twilio account |
| GET | `/auth/calendar` | Connect Google Calendar |
| GET | `/api/tools` | List enabled agent tools |
| DELETE | `/api/tools/{tool_name}` | Disable a tool |
| GET | `/api/calls` | Paginated call history |
| GET | `/api/calls/{id}` | Single call details |
| DELETE | `/api/calls/{id}` | Soft-delete a call record |
| GET | `/api/health` | Health check |
| GET | `/api/config` | Public client config |

## Testing

```bash
# Health check
curl http://localhost:8000/api/health

# Get settings (requires auth)
curl -b cookies.txt http://localhost:8000/api/settings

# List Gemini voices
curl http://localhost:8000/api/gemini-voices
```

## Deployment

A `docker-compose.yml` is included. You'll need to provide a Postgres instance (or add a `db` service) and set all environment variables via a `.env` file or your orchestrator.

## License

[MIT](LICENSE) © 2026 Bar Dahan
