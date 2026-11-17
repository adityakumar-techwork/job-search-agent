# Job Search Agent

An autonomous job search assistant tuned for Senior/Staff individual-contributor engineering roles in India (**Bangalore**, **Delhi-NCR**, and **Remote India**) — target titles, experience, stack, and location priority are all configurable.

Every day it pulls fresh postings from company ATS boards (**Greenhouse**, **Lever**, **Ashby**) and optionally **JSearch**, scores each role against your redacted resume with **Google Gemini**, lists the keywords your resume is missing, and surfaces everything in a local React dashboard. A weekly email digest is sent via Mailgun.

> **Privacy first:** your resume is redacted *before* anything is stored in PostgreSQL, sent to Gemini, or logged — name, phone numbers (incl. +91 formats), email, LinkedIn/GitHub URLs, PIN/ZIP codes, PAN, Aadhaar, DOB, and references. Add your own patterns with `ADDITIONAL_REDACTION_PATTERNS`. Raw resumes and `.env*` files are git-ignored.
>
> Gemini's free tier may use prompts to improve Google's models; use a paid (billing-enabled) key if that matters to you.

## How it works
1. **Fetch** — ATS boards in `config/companies.json` (India / remote-India roles only) + JSearch (`config/jsearch.json`, country `in`). Jobs matching `EXCLUDE_KEYWORDS` are dropped; duplicates across sources are merged.
2. **Select** — only jobs not analysed before; up to 30 per run, split across `LOCATION_PRIORITY` (`bangalore-ncr`, `remote`, `other`).
3. **Score** — one Gemini call per job: relevance, interview chance, category (`auto-flag` / `maybe-flag` / `skip`), matched skills, missing keywords. Benefits/EEO boilerplate is stripped first.
4. **Learn** — skills that keep matching strong jobs and the ones you applied to become focus patterns that steer future scoring; patterns not seen for `AGENT_MEMORY_RETENTION_DAYS` are forgotten.

## Local setup
Requires Node 20+ and Docker.

```bash
npm install && (cd dashboard && npm install)
cp .env.example .env.local      # fill in LLM_API_KEY etc.
cp .env.example .env            # docker compose reads POSTGRES_PASSWORD from .env
docker compose up -d            # Postgres on 127.0.0.1:5433
npm run db:migrate              # create tables (safe to re-run)
npm run agent                   # fetch + score today's jobs
npm start                       # API on 127.0.0.1:3001
cd dashboard && npm run dev     # UI on http://localhost:3000
```

Put your resume at `./resume.pdf` (or set `RESUME_PATH`). It must be a text PDF — scanned images have no extractable text.

The API has no login, so it only listens on `127.0.0.1` and refuses any other `HOST`. To open the dashboard from another machine, use an SSH tunnel (`ssh -L 3000:127.0.0.1:3000 -L 3001:127.0.0.1:3001 <host>`) rather than exposing it.

## Running daily on GitHub Actions
`.github/workflows/run-agent.yml` runs at 08:00 IST; `weekly-digest.yml` emails a summary on Sunday 18:00 IST. They need a hosted Postgres (e.g. Neon, Supabase) — the schema is applied automatically on every run.

Repository **secrets** (Settings → Secrets and variables → Actions):

| Secret | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | both | `postgresql://…` of your hosted DB |
| `LLM_API_KEY` | agent | Gemini key from https://aistudio.google.com/apikey |
| `RESUME_BASE64` | agent | `base64 -i resume.pdf \| pbcopy` (macOS) |
| `RAPIDAPI_KEY` | agent | optional — JSearch |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `RECIPIENT_EMAIL` | digest | |

Optional repository **variables**: `LLM_MODEL`, `JOB_TITLES`, `YEARS_EXPERIENCE`, `PREFERRED_TECHNICAL_STACK`, `LOCATION_PRIORITY`, `EXCLUDE_KEYWORDS`, `USER_CONTEXT`, `MAILGUN_BASE_URL`, `DASHBOARD_URL`.

## Configuration
See `.env.example` for every setting. Notable ones:

- `LLM_MODEL` / `LLM_FALLBACK_MODELS` — the configured model is tried first, then the fallbacks if it is rate-limited or retired. (Older `CLAUDE_API_KEY` / `CLAUDE_MODEL` names still work.)
- `USER_CONTEXT` — free-text rules added to every scoring prompt, e.g. *"IC backend roles only, no people management."*
- `LOCATION_KEYWORDS_HUB` — what counts as the Bangalore/NCR hub.

## Development
```bash
npm run typecheck && npm test
(cd dashboard && npm run lint && npm run build)
```
CI (`.github/workflows/ci.yml`) runs the same checks plus the DB-backed tests against a throwaway Postgres.
