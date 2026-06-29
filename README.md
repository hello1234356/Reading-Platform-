# Reading Social

A student reading community built with React, Vite, and Supabase. The browser talks directly to Supabase; there is no custom Express server or SQLite database.

## Setup

1. Create a Supabase project.
2. Run `supabase/migrations/202606220001_initial_schema.sql` in its SQL Editor.
3. Configure and run the frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Set the project values in `frontend/.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Never put a Supabase service-role key in a Vite environment variable. All `VITE_` values are visible in the browser.

Supabase access lives in `frontend/src/lib/`: `auth.js` handles student sessions, `api.js` contains page queries, and `supabase.js` owns the client configuration.
