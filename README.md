# HALO mission dashboard

The NYMPHA mission briefing's **Enter Mission Control** button opens the Next.js app in `astronaut-mock-main/astronaut-mock-main`

The dashboard creates **250 NYMPHA mission records** in memory whenever it loads. These generated preview records include sleep, stress, workload, heart rate, blood pressure, and rehabilitation precision, reaction-time, and attention indicators. The latest 15 days are shaped to show a declining trend. They are not actual astronaut measurements or live mission telemetry, and must not be used for health decisions.

All dashboard edits reset when the page is reloaded. On startup, the app removes only its previous HALO dashboard-data, backend-URL, and NASA OSDR query-cache keys from browser storage; it does not clear unrelated site data. Use **Export Debrief (JSON)** before closing if you need to keep the current session.

## Dashboard features

- A trend notice opens on each dashboard load, explains the illustrative Markov result, and links to Yuki and optional rehabilitation practice.
- A daily check-in is required before entering the dashboard. For sleep, stress, workload, heart rate, and paired blood-pressure readings, choose either Measured and enter a valid value or explicitly choose Not measured; all six NASA-TLX workload ratings are required.
- Colorful 7-day, 15-day, 30-day, and 250-day charts for all nine daily measures, plus a searchable-by-scroll 250-entry check-in history.
- A 15-day trend explorer with a composite NYMPHA index, tier-distribution chart, per-metric bars, and an add-one-smoothed Markov transition matrix. The index, tiers, and next-state percentages are illustrative only, not validated predictions or clinical severity ratings.
- The 25-game `halo_rehabilitation_portal.html` is served at `/rehabilitation` and embedded in Cognitive Tasks. Results are saved to the in-memory session, assigned to the matching calendar day, displayed as scores out of 10, and used only to recommend optional practice from the 25-game playlist.
- The 250-day NYMPHA history includes a daily six-rating NASA-TLX questionnaire, one task-session summary with linked TLX assessment per day, and 25 game-result summaries per day (6,250 total). Generated preview records are distinguished from participant-entered records.
- The integrated `halo_integrated_rehabilitation_cognitive_protocol.html` is served at `/integrated-rehabilitation` and embedded in Cognitive Tasks. It combines game practice and randomized mission dilemmas, saves a combined score plus game/dilemma sub-scores, and exports its detailed JSON result.
- Measurements include a daily NASA-TLX trend chart and rehabilitation practice score chart. The separate NASA-TLX workspace remains available for post-task assessments linked to task sessions.
- A Yuki assistant that uses English by default and switches to Japanese only when explicitly requested. It does not claim GPT-4 or access device location.
- Yuki can analyze all available daily metrics, task-session summaries, six NASA-TLX ratings, and saved game results from the latest 15 dates (up to 400 task sessions and 400 game results) when explicitly asked. Participant-entered check-ins and games are included automatically only for explicit record/game analysis. Uploaded HALO debrief JSON is reduced to validated records from that same window; notes, raw trials, and unrelated file content are excluded. Normal chat does not attach dashboard records.
- Yuki acts as an empathetic, non-clinical mission companion. Practice suggestions show up to three lower-scoring games based on recent game results, or clearly labeled starter options when no scores are available.
- A step-by-step popup follows check-in and practice completion. After each check-in, one rehabilitation game must be completed and its result saved before dashboard navigation or Yuki record analysis is unlocked. Games launch with automatic result capture; the popup shows the score out of 10 and several next-game options, plus an action to analyze the run and recent 15-day context with Yuki.

## Optional Groq

Copy `.env.example` to `.env.local`, set `GROQ_API_KEY` on the Next.js server, and restart the app. Never put the key in client-side code or commit it. The model defaults to `openai/gpt-oss-120b`; `GROQ_MODEL` can override it.

Yuki answers free-text questions with Groq when configured. The three focused game pages are served at `/games/<game-file>`. Normal chat sends the current message and up to eight recent chat messages to the Next.js server and Groq, but does not include dashboard records. A user-requested mission/game analysis additionally sends validated, bounded summaries of the recent 15 calendar days, including participant-entered readings and game results. A selected game JSON contributes only validated summary metrics, never raw trials or unrelated fields. The rehabilitation portal's completed score is stored in memory and sent only when the user chooses **Analyze with Yuki**. NASA OSDR results are quick study metadata, not full dataset files or proof that a game score measures health. Avoid putting sensitive personal information in chat. Without a key, local record summaries and source searches remain available, but Groq-generated answers are not.

## NASA OSDR and data handling

OSDR lookups use a server-side route against the public NASA repository. Search results and pinned references are kept only for the current page session. A pinned reference records the title, accession, context, public study description, assays, source URL, retrieval time, and `External NASA OSDR` provenance. Yuki's game search uses the public GitHub repository API and only lists projects with a recognized SPDX license.

The dashboard does not connect to browser local storage or a Python backend. Exported JSON includes daily check-ins and TLX ratings, task telemetry, NASA-TLX records, game scores, OSDR references, provenance, and model caveats. The printable report is browser-generated. The static 3D Earth page at the repository root is separate from the dashboard and does not record data.

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

<div align="center">

# 🚀 HALO

### Health · Act · Log · Observe

**A mission-support dashboard prototype for astronaut wellbeing, workload reflection, cognitive practice, and space-health research.**

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript)
![Status]MVP

</div>

---

## 🌌 About HALO

Long-duration missions can involve demanding workloads, isolation, and complex routines. HALO explores how a single dashboard could help a crew member record daily reflections, review cognitive practice, find relevant research, and access supportive resources.

The project includes a fictional astronaut profile and generated demonstration records so that the interface can be explored without real astronaut telemetry.

> **HALO is a prototype—not a medical device, diagnostic tool, validated health-prediction system, or NASA product.** Generated data and experimental trends must not be interpreted as personal observations or clinical advice.

## ✨ Features

### 🧭 Mission dashboard
- Mission overview with recent check-ins and selected measurements.
- Fictional astronaut profile and mission details.
- Clear distinction between generated demo records and participant-entered records.

### 📝 Daily check-ins
Record daily observations such as:
- Sleep
- Stress
- Current workload
- Resting heart rate
- Blood pressure
- Daily NASA-TLX workload ratings

When a reading is unavailable, it can be marked **Not measured** instead of being entered as zero.

### 📈 Measurements and history
- Review previous check-ins and saved observations.
- Explore charts over available time ranges, including 7-day, 15-day, 30-day, and mission views.
- View rehabilitation practice measures alongside other recorded data.
- Missing values are not plotted as zero.

### 🧠 Cognitive tasks and rehabilitation
- Try interactive attention and coordination tasks, including **Signal Match** and **Orbital Supply Catch**.
- Explore the rehabilitation activities and integrated practice experience.
- Review saved task and practice results.

Practice feedback is experimental and is not a diagnosis or clinical assessment.

### 📊 NASA-TLX workload assessments
- Rate six perceived-workload dimensions: mental demand, physical demand, temporal demand, performance, effort, and frustration.
- Review raw and weighted scores where available.
- Link assessments with task sessions.

### 🤖 Yuki AI mission companion
Yuki provides a conversational interface for exploring mission information, recent records, practice sessions, and research.

- Depending on configuration, the assistant can use local responses or an external Groq service.
- Groq is disabled unless the required environment configuration is present.
- Never put API keys in client-side code or commit them to the repository.

Yuki is a supportive demo assistant, not a clinician or emergency service.

### 🔬 NASA Open Science Data Repository (OSDR)
- Search NASA OSDR studies by title or accession.
- Inspect study details and source links.
- Pin useful references to the mission log.

Search results come from an external service and may be unavailable when that service is offline.

### 📉 Experimental NYMPHA trend explorer
- Visualizes generated NYMPHA records and illustrative trend indicators.
- Includes charts, metric signals, and experimental Markov transition estimates.
- Model notes describe the experimental calculations.

These are **not validated health predictions, medical thresholds, or personal assessments**.

### 🌸 Belonging experience
- View a short slideshow of Japanese locations.
- Continue to a scenic film hosted on Vimeo, or open it directly on Vimeo.

Vimeo playback requires an internet connection and may depend on the video's embedding settings.

### 🔐 Encrypted mission debrief
- Export a debrief as encrypted JSON.
- Unlock a compatible encrypted file with its passphrase.
- Encryption uses Web Crypto, PBKDF2-SHA-256 key derivation, and AES-256-GCM.

Unlocking an export produces a plaintext JSON download. Keep both the encrypted file and its passphrase secure.

## 🛠️ Technology

- [Next.js](https://nextjs.org/) App Router
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- Web Crypto API for encrypted exports
- NASA OSDR and Vimeo integrations
- Groq API support for the optional external AI provider

## 🚀 Run locally

The Next.js app is inside `astronaut-mock-main/astronaut-mock-main`.

" One small step for a human, a leap for humanity. "                                                                                     - S Ashwanth Sankar. Made for NASA Space Apps Challenge 2026. Let humanity benefit from the curiosity of mankind.
