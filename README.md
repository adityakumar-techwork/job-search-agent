# Job Search Agent

An autonomous, AI-powered job search assistant tailored for Senior/Staff Individual Contributor (IC) backend engineering roles in India (**Bangalore**, **Delhi-NCR**, and **Remote India**).

Every day it pulls fresh postings from **Greenhouse**, **Lever**, and **JSearch**, scores each role against your redacted resume using **Google Gemini Flash** (`gemini-3.5-flash-lite`), extracts missing LaTeX resume keywords + ATS Requisition IDs, and surfaces everything in a React dashboard.

> **Privacy first:** Your resume is redacted (phone, email, SSN, ZIP, DOB, references) *before* anything is stored in PostgreSQL, sent to the Gemini API, or logged. Raw resumes and `.env*` files are git-ignored and never leave your machine.

## Features
- **Multi-Source Job Aggregation:** Greenhouse & Lever ATS boards (`config/companies.json`) + JSearch RapidAPI India hub sweep (`config/jsearch.json`).
- **Automated Location Hub Routing:** Normalizes Indian city and state tags (`IN - Karnataka`, `IN - Haryana`, `IN - Uttar Pradesh`, Bengaluru, Gurgaon, Noida) into **Bangalore / NCR**, **Remote**, and **Other**.
- **AI Fit Scoring & Keyword Gap Extraction:** Scores relevance and interview likelihood (`Strong match`, `Worth a look`, `Skip`), surfaces ATS Requisition IDs, and lists missing keywords to tune your LaTeX resume.
- **On-Demand Referral & Outreach Generator:** Click **Generate** on any match in the dashboard to draft a <280-character LinkedIn referral note (with Req ID) and a 3-bullet quantified impact summary.

## Quick Start
1. `git clone https://github.com/adityakumar-techwork/job-search-agent.git && cd job-search-agent`
2. `npm install && (cd dashboard && npm install)`
3. `docker compose up -d`
4. Place your resume PDF at `./resume.pdf` and copy `.env.example` to `.env.local` with your keys.
5. Run `npm run agent` to fetch & score roles, `npm start` for the API (`:3001`), and `cd dashboard && npm run dev` for the UI (`:3000`).
