# Musings — personal blog with admin

A minimal, empty personal blog (no sample content). Public pages: **Home**, **Musings** (list of entries), **Tags**, per-tag pages, optional entry pages, and an **RSS** feed. Everything is edited from `/admin`.

## What you can edit in the admin panel
- **Profile** – profile picture (upload or URL), name, tagline, page title (e.g. "Musings"), page description, "Browse by tags" link on/off, home page intro text.
- **Entries** – title, optional external link (shows the domain under the title), description, tags, date, optional full text, publish/draft, edit/delete.
- **Tags** – rename, merge or delete tags across all entries.
- **Menu links** – add, reorder, edit or remove the links in the top-right menu.

## Quick start (Node.js 18+, Neon account)
1. **Create the database:** sign in at https://neon.com, create a project, click **Connect**, and copy the connection string (it looks like `postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`).
2. **Set up the project:**
   ```bash
   npm run setup     # installs everything, creates backend/.env, builds the site
   ```
3. **Edit `backend/.env`:** paste the Neon string into `DATABASE_URL`, and change `ADMIN_EMAIL` and `ADMIN_PASSWORD`. (`JWT_SECRET` is already generated.)
4. **Run:**
   ```bash
   npm start         # http://localhost:4000
   ```
   The tables are created automatically on first start. Check `http://localhost:4000/api/health` – it should say `"storage":"postgres"`.
5. Sign in at `http://localhost:4000/admin`.

Your data lives in Neon, so it survives restarts and redeploys. If `DATABASE_URL` is left empty the app falls back to a local file (`backend/data/db.json`) – only suitable for trying it out.

### Development mode (hot reload)
```bash
npm run dev       # site http://localhost:5173 , API http://localhost:4000
```

## Deploying
**Single server (simplest)** – run `npm run setup` then `npm start` on any Node host (Render, Railway, a VPS). Set the env vars from `backend/.env.example` in the host's dashboard. Neon keeps your data safe even though these hosts wipe their disk.

**Split hosting (Vercel frontend + Render API)** – build the frontend with `VITE_API_URL=https://your-api.example.com/api`, and set `FRONTEND_URL=https://your-frontend.example.com` and `SITE_URL` on the API. Add a rewrite on Vercel sending all paths to `/index.html`.

## Environment variables (backend/.env)
| Name | Purpose |
|---|---|
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin login (required) |
| `JWT_SECRET` | Random string used to sign login tokens (required; `setup` generates one) |
| `DATABASE_URL` | Neon connection string (empty = local JSON file, for testing only) |
| `PORT` | Default 4000 |
| `FRONTEND_URL` | Only for split hosting (CORS) |
| `SITE_URL` | Public URL used in RSS links |

## Fixes compared with the previous starter
- Saving the profile now updates the public header immediately (it used to need a page reload).
- Login/admin screens no longer hardcode the name "Musings".
- Admin route is protected: expired tokens redirect to login; already signed-in visitors skip the login form.
- Slugs from non-English titles no longer all collapse to `post` and collide; duplicates get `-2`, `-3`…
- Link/image URLs are validated (`javascript:` links rejected); login is rate-limited and uses constant-time comparison.
- Neon/PostgreSQL storage reworked (settings, entries and tags tables, created automatically) with a clear error if the connection string is wrong; a local-file fallback exists for quick tests.
