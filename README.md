# PashuRaksha AI

PashuRaksha AI is a static frontend served by an Express backend. The backend owns authentication, SQLite persistence, health-risk calculations, validation, and dashboard aggregation.

## Requirements

- Node.js 18 or newer
- npm

## Run locally

```powershell
Copy-Item .env.example .env
npm install
npm start
```

Open `http://localhost:3000/login.html`. The Express server serves the existing HTML/CSS/JavaScript and the API from the same origin, so no separate frontend server or CORS setup is needed for local development.

The standalone Python build used for the current local demo can be run without third-party packages:

```powershell
python python_backend.py --port 5000
```

Open `http://127.0.0.1:5000/login.html`. It includes the profile setup, Marathi-first language selection, structured assistant, SQLite history, and verified-only veterinary search flow.

The login accepts a valid email and a password of at least six characters. A new email creates a user on first sign-in; later sign-ins verify the stored bcrypt password. The session is an HTTP-only cookie.

For development with automatic restart:

```powershell
npm run dev
```

## API flow

- `POST /api/auth/login` validates credentials, creates the user when needed, and sets the session cookie.
- `GET /api/auth/session` checks the current session.
- `POST /api/health-checks` validates the entered animal values, calculates the risk on the server, saves the result, and returns it.
- `GET /api/health-checks` returns the signed-in user's saved history.
- `GET /api/dashboard` returns per-user totals, recent reports, and chart percentages.
- `POST /api/auth/logout` clears the session cookie.
- `GET/POST /api/profile` reads and saves farmer profile, location, and language preferences.
- `POST /api/chat` returns server-side preliminary guidance in the selected supported language.
- `GET /api/vets` returns only records explicitly added to the verified veterinary-clinic table; it does not invent listings.

Health scoring is based on the submitted temperature, appetite, behavior, and symptoms. Low risk is below 25 points, medium is 25-59, and high is 60 or more. Change `src/services/healthService.js` when the domain model is ready to use a clinically approved scoring model.

## Safety and provider setup

The assistant is preliminary guidance and is not a veterinary doctor or a definitive diagnosis. Serious symptoms should be referred to a qualified veterinarian. Photo selection is currently a local UI affordance and is not used to claim diagnosis. Google/Apple buttons are intentionally non-functional until official OAuth client IDs, redirect URIs, and server-side callback handling are configured; the app never collects provider passwords or displays a fake provider login page.

## Configuration

Copy `.env.example` to `.env` and set a long random `JWT_SECRET` for any deployed environment. SQLite data is created in `data/pashuraksha.sqlite`, which is ignored by git. Set `COOKIE_SECURE=true` when serving over HTTPS.