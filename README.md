# Campus Event Hub

Campus Event Hub is a beginner-friendly full-stack web application for discovering campus events, registering as a student, and publishing events as an organizer.

## Problem statement

Campus event information is often scattered across notice boards, class groups, and social media. Campus Event Hub gives students one place to browse events and register, while approved organizers can publish and manage their own events.

## Roles

- **Visitor:** browse and search published events and view event details.
- **Student:** create an account, log in, and register once for each event.
- **Organizer:** all student capabilities, plus create, edit, and delete events they own.

New accounts are always created as `student`. A trusted administrator must promote a user to `organizer` in Supabase SQL Editor. Never allow users to choose their own role during signup.

## Features

- Responsive event discovery with keyword search, category filtering, and sorting.
- Event details with date, venue, category, capacity, and remaining places.
- Supabase Auth sign-up and login.
- Student event registration, duplicate-registration prevention, and a personal registration list.
- Organizer-only event publishing, editing, and deletion.
- Express REST API, server-side validation, role checks, rate limiting, and security headers.
- PostgreSQL constraints and a row-locked registration function to prevent overbooking.

## Technology stack

HTML5, CSS3, Vanilla JavaScript, Node.js, Express.js, Supabase Auth, Supabase PostgreSQL, Git, and GitHub. The backend uses `@supabase/supabase-js`, `dotenv`, `helmet`, and `express-rate-limit`.

## Folder structure

```text
campus-event-hub/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── backend/
│   ├── middleware/auth.js
│   ├── routes/auth.js
│   ├── routes/events.js
│   ├── server.js
│   ├── supabase.js
│   ├── package.json
│   ├── .env
│   ├── .env.example
│   └── .gitignore
├── database/schema.sql
├── .gitignore
└── README.md
```

## Prerequisites

Install these on your computer:

- [Node.js LTS (includes npm)](https://nodejs.org/)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Git](https://git-scm.com/downloads)
- A free [Supabase account](https://supabase.com/)

## Setup on Windows

### 1. Open the project

Extract the ZIP. In VS Code, choose **File → Open Folder** and select `campus-event-hub`. Open **Terminal → New Terminal**.

### 2. Verify Node.js and Git

Run these commands in the VS Code terminal:

```powershell
node --version
npm --version
git --version
```

Each command should print a version. If a command is not recognized, install the relevant software and restart VS Code.

### 3. Create a Supabase project

1. Sign in to [Supabase](https://supabase.com/) and create a project.
2. Wait until the database is ready.
3. Open **SQL Editor → New query**.
4. Open `database/schema.sql`, copy the entire file, paste it into the editor, and run it.
5. In **Project Settings → API** (the exact menu wording may vary), copy the project URL, publishable/anon key, and service-role/secret key.
6. Keep the service-role key private. It belongs only in `backend/.env`.

Verify in **Table Editor** that `profiles`, `events`, and `registrations` exist. In the SQL Editor you can also run:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'events', 'registrations')
order by table_name;
```

### 4. Configure environment variables

Open `backend/.env`. Replace the three placeholder values:

```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
```

Use your own real values from Supabase. Do not include quotation marks unless a value actually requires them. `.env` is local and ignored by Git; `.env.example` documents variable names and safe placeholders and should be committed.

### 5. Install dependencies

In the terminal, change into the backend folder:

```powershell
cd backend
npm install
```

npm downloads the packages listed in `backend/package.json` and creates `package-lock.json`. Wait for the command to finish without an `npm ERR!` message.

### 6. Start the application

Still inside `backend/`, run:

```powershell
npm run check
npm start
```

The syntax check should complete without errors. The server should print:

```text
Campus Event Hub running at http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Do not open `frontend/index.html` directly, because the app uses the Express API.

To stop the server, click the terminal and press `Ctrl+C`. For auto-restart during development, use `npm run dev`.

## Promote an organizer account

1. Sign up in Campus Event Hub using the account that should manage events.
2. If Supabase email confirmation is enabled, confirm the email and log in.
3. In Supabase **SQL Editor**, run the following after replacing the email with the account's exact email:

```sql
update public.profiles
set role = 'organizer'
where email = 'organizer@your-college.edu';
```

4. Confirm the row was updated, then log out and log back in so the frontend refreshes the role. The Organizer Studio navigation should appear.

Only a trusted project administrator should run this query. Never make role changes available to ordinary users.

## Architecture

```text
Browser (HTML/CSS/Vanilla JS)
          | fetch() / JSON
          v
Express REST API (Node.js)
          | checks bearer token, profile role, input
          v
Supabase Auth + PostgreSQL
```

The frontend only calls the Express API. Express verifies Supabase access tokens and uses a server-only Supabase service-role key for database operations. Since this key bypasses Row Level Security, the backend must check ownership and role before every protected operation. RLS is enabled on the tables and direct browser table policies are intentionally not added.

## API endpoints

All responses are JSON. Protected routes require `Authorization: Bearer <Supabase access token>`.

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/api/health` | Health check | Public |
| POST | `/api/auth/signup` | Create a student account | Public; body: `full_name`, `email`, `password` |
| POST | `/api/auth/login` | Log in | Public; body: `email`, `password` |
| GET | `/api/auth/me` | Get current profile | Signed in |
| POST | `/api/auth/logout` | Client-side token discard acknowledgement | Signed in |
| GET | `/api/events` | List published events and registration counts | Public |
| POST | `/api/events/:id/register` | Register current user | Signed in |
| GET | `/api/events/registrations/me` | List current user's registrations | Signed in |
| GET | `/api/events/organizer/events` | List own events | Organizer |
| POST | `/api/events/organizer/events` | Publish an event | Organizer; event fields in JSON body |
| PATCH | `/api/events/organizer/events/:id` | Edit an owned event | Organizer; event fields in JSON body |
| DELETE | `/api/events/organizer/events/:id` | Delete an owned event and registrations | Organizer |

Event JSON fields: `title`, `description`, `category`, `venue`, `starts_at` (ISO date-time), and `capacity`. Supported categories are `Workshop`, `Technical`, `Cultural`, `Sports`, `Talk`, and `Other`.

Common errors include `400` invalid input, `401` missing/invalid login, `403` insufficient permissions, `404` missing event, `409` duplicate registration/full event, `429` rate limit, and `500` unexpected server error.

## How to use

1. Browse or search the event cards.
2. Select **Details** to view event information.
3. Create an account or log in, then register for an event.
4. Open **My registrations** to see saved registrations.
5. Promote an account to organizer using the SQL instructions above.
6. Log in as that organizer, publish an event, and use Edit/Delete to manage it.

The SQL schema does not insert fake events. Organizers can create real demo events through the app.

## Testing checklist

- [ ] `GET http://localhost:3000/api/health` returns JSON with `"status":"ok"`.
- [ ] With valid Supabase configuration, the homepage loads without the API setup notice.
- [ ] Search, category filter, and sorting change the displayed events.
- [ ] Empty signup fields are rejected by the browser and backend.
- [ ] A student can sign up and log in after email confirmation if enabled.
- [ ] A student can register once; repeating the same registration returns an error.
- [ ] A full event cannot accept more registrations than capacity.
- [ ] A student receives `403` from organizer endpoints.
- [ ] An organizer can create and edit an event they own.
- [ ] An organizer cannot edit or delete another organizer's event.
- [ ] Event deletion removes associated registrations due to the foreign key.
- [ ] A missing/expired token cannot access protected endpoints.
- [ ] Layout remains usable at phone and desktop widths.

For a quick health check, open `/api/health`. For authenticated routes, use the app UI or an API client with a valid bearer token.

## Troubleshooting

- **`Supabase environment variables are missing`:** check `backend/.env`, spelling, and that you started the server from the backend folder.
- **`Invalid API key` / 401:** copy the right project's keys; ensure `SUPABASE_URL` and keys belong to the same project.
- **Tables not found:** run the full `database/schema.sql` in the Supabase SQL Editor.
- **Signup says email confirmation is required:** confirm the email first, then log in. For a local classroom demo, Supabase Auth settings can be configured by the project owner; do not disable protections on a real deployment without considering the consequences.
- **Organizer tab is missing:** promote the account in SQL Editor, then log out and log in again.
- **Port already in use:** change `PORT=3001` in `.env`, restart the server, and open `http://localhost:3001`.
- **`npm` or `node` not recognized:** install Node.js LTS, restart the terminal, and verify versions.
- **Browser shows setup notice:** keep the backend terminal running and inspect its error output. Check `/api/health` first.
- **No events appear:** this is expected on a new database. Sign in with an organizer account and publish an event.

## GitHub upload

From the project root, first check what will be committed:

```bash
git init
git status
git add .
git status
git commit -m "Build Campus Event Hub"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

Replace the repository URL with your own GitHub repository URL. Before `git add .`, confirm `.env` and `node_modules/` are ignored and `.env.example` is included. If Git says a remote already exists, use `git remote -v` to inspect it rather than adding a duplicate.

**Important:** `.gitignore` does not remove a secret that was committed earlier. If a key is exposed, rotate it in Supabase immediately and clean the repository history as appropriate.

## Security notes and limitations

- Never expose the service-role key, database password, or other privileged credentials in frontend files or GitHub.
- All new accounts default to the `student` role. Organizer promotion is an administrator-only SQL operation.
- The backend validates requests and checks organizer ownership. Keep those checks if you extend the app.
- Access tokens are held in `sessionStorage`, so they are cleared when the browser tab/session ends; this is a teaching MVP, not a hardened production session design.
- The logout endpoint does not revoke a Supabase token server-side; the browser discards it and Supabase tokens expire. A production app should use a carefully designed session/revocation strategy.
- There is no event image upload, payment flow, email notification, or registration cancellation in this MVP.
- RLS is enabled, but the server uses a service-role key and therefore bypasses RLS. Security depends on the Express authentication, role, and ownership checks. Do not add a browser database client using the service-role key.
- For production deployment, add HTTPS, a stronger session strategy, monitoring, backups, and a security review.

## License

For educational use. Add a license if you plan to distribute the project publicly.
