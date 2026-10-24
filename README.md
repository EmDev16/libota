# Libota: a family tree for the whole family

[![CI](https://github.com/EmDev16/libota/actions/workflows/ci.yml/badge.svg)](https://github.com/EmDev16/libota/actions/workflows/ci.yml)

Libota is a private family tree website. Relatives log in, browse the tree, look up how two people are related, and the admins keep the data up to date. It is available in French, English, Lingala and Dutch.

**Live site:** _libota1.vercel.app_

## Contents
- [What it can do](#what-it-can-do)
- [Make your own family tree (no coding needed)](#make-your-own-family-tree-no-coding-needed)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Run it on your computer](#run-it-on-your-computer)
- [Run it with Docker](#run-it-with-docker)
- [Settings (environment variables)](#settings-environment-variables)
- [Photos](#photos)
- [Tests](#tests)
- [CI/CD and deployment](#cicd-and-deployment)
- [Backups and restoring data](#backups-and-restoring-data)
- [How the main parts work](#how-the-main-parts-work)
- [Troubleshooting](#troubleshooting)
- [Working on the project](#working-on-the-project)
- [AI transparency notice](#ai-transparency-notice)

## What it can do
- **Two tree views.** The modern view is an interactive canvas (zoom, pan, minimap) and is the default on a computer. The traditional view shows couples with their children underneath and is the default on a phone. You can switch at any time. Both handle several partners per person: the children are grouped under the right partnership, in different colours.
- **"View from" a family.** Pick a last name (for example "Mbala") and the tree shows the oldest person with that name and all their descendants. A person with a double name such as "Mbala Venia" belongs to both families. There is also a separate section for people who are not linked to anyone yet.
- **Search and timeline.** The search box in the menu finds a person and takes you to them in the tree, centred and highlighted. The timeline lists births, deaths and photos in order, and shows upcoming birthdays.
- **Relationship finder.** Pick two people and get the family relationship with the path between them, in your language. It knows blood relatives, half- and step-family and in-laws (brother-in-law, cousin by marriage, step-grandfather, ...).
- **People.** Admins add, edit and delete people with photo (and remove the photo), dates, gender, description, parents and partners. When you add someone, the form suggests the other parent and shows the siblings; from a card in the tree you can add a sibling or a child directly.
- **Suggestions from members.** Members never change the tree directly. They send suggestions (a new person, missing information, "I am missing") and an admin approves or rejects each one.
- **Photo gallery.** Family photos with captions, dates and people tagged on them. Some photos can be hidden behind tags, so only the accounts you allow can see them. Photos are stored at high quality.
- **Dashboard.** Family statistics (people, generations, average age of the family, oldest and youngest, upcoming birthdays), a to-do list of pending suggestions, recent activity and a gallery card. Admins choose which members may see the statistics; members never see the recent activity.
- **Activity log.** Every change (who did what, and when) is recorded, and an admin can undo some of them. Saving a person without changing anything is not logged.
- **PDF export.** The whole tree or a part of it (descendants of one person, siblings, first cousins, ...), as one big poster, split over normal pages, or one page per branch. Photos are optional. The PDF uses the same colours as the website.
- **Backup and restore.** Export everything as a JSON file and import it again (add to the existing data, or replace it).
- **Users and roles.** `admin` and `member`. Admins create users, reset passwords and decide who sees statistics and which hidden photos.
- **Four languages.** French, English, Dutch and Lingala (the Lingala texts have not been checked by a native speaker). Confirmation boxes and messages are part of the site, not the browser's "this site says" popups.

## Make your own family tree (no coding needed)
You can run your own private copy of Libota for your family for free. It takes about an hour, and you only copy and paste. You need an email address and a GitHub account.

1. **Get the code.** On the GitHub page of this project, click **Fork** (top right). You now have your own copy.
2. **Create the database.** Make a free account on [MongoDB Atlas](https://www.mongodb.com/atlas), create a free cluster, add a database user (write down the password) and copy the connection string. It looks like `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/libota`.
3. **Create the photo storage.** Make a free account on [Cloudinary](https://cloudinary.com) and copy the *API environment variable* (it starts with `cloudinary://`). It is only needed if you want photos online.
4. **Put the server online.** On [Render](https://render.com), choose *New → Blueprint*, pick your fork and paste the connection string and the Cloudinary line when asked.
5. **Put the website online.** On [Vercel](https://vercel.com), import your fork, set the *Root Directory* to `frontend`, and add the setting `VITE_API_URL` with your Render address followed by `/api`.
6. **Connect the two.** On Render, set `CORS_ORIGIN` to your exact Vercel address (no `/` at the end).
7. **Create your admin account.** Follow step 6 under [Setting it up from scratch](#setting-it-up-from-scratch). It is one command, and you choose your own username and password.
8. **Fill the tree.** Log in, add the first person, then add their parents, partner and children. Invite relatives by creating them an account in the admin panel; they can then suggest changes that you approve.

The detailed version of every step, and what to do when something goes wrong, is further down in this file. Keep a JSON backup (admin panel) from time to time. The free database does not make backups for you. The site is private: only people with an account can see the tree, so share passwords carefully.

## Tech stack
| Part | Technology |
|---|---|
| Website | React 19, Vite, React Router, i18next, @xyflow/react (modern view), react-zoom-pan-pinch (traditional view), jsPDF |
| API | Node.js 22, Express 5, Mongoose 9, JSON Web Tokens, bcryptjs, multer |
| Database | MongoDB (MongoDB Atlas online) |
| Photos | Cloudinary online, the `uploads` folder locally |
| Tests | Vitest (website), Node's test runner with supertest and mongodb-memory-server (API) |
| Automation | GitHub Actions, Docker, docker-compose |
| Hosting | Vercel (website), Render (API), MongoDB Atlas, Cloudinary |

## Project structure
```
libota/
├── backend/
│   ├── app.js                 Express app (no database, no port: easy to test)
│   ├── server.js              starts the server: connects to MongoDB and listens
│   ├── seed.js                helper script, run with `npm run seed`
│   ├── middleware/auth.js     login check and admin check
│   ├── models/                Person, User, GalleryPhoto, SuggestionRequest, AuditLog
│   ├── routes/                auth, person, tree, export, gallery, requests, audit
│   ├── utils/
│   │   ├── kinship.js         works out "uncle", "cousin", "step-father", "brother-in-law" ... for the relationship finder
│   │   ├── stats.js           the numbers on the dashboard
│   │   ├── audit.js           writes the activity log
│   │   ├── photoStorage.js    saves photos on Cloudinary or on disk
│   │   ├── createAdmin.js     creates (or resets) an admin user from the command line
│   │   └── migratePhotosToCloudinary.js   one-time move of photos on disk to Cloudinary
│   ├── test/                  API and unit tests
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/             Dashboard, FamilyTree, PersonList, PersonForm, RelationshipFinder,
│   │   │                      Gallery, Timeline, Requests, SuggestionForm, ActivityLog, AdminPanel, Login
│   │   ├── components/        Navbar, SearchBox, PersonNode, TreeNodes, ExportPdfModal,
│   │   │                      DialogProvider (our own confirm/alert boxes), AdminOverview
│   │   ├── utils/             treeLayout.js and graphLayout.js (tree layout), families.js (last-name views),
│   │   │                      relationship.js (relationship sentences), pdfExport.js, photo.js
│   │   ├── locales/           fr.js, en.js, nl.js, ln.js (all texts)
│   │   ├── contexts/          AuthContext.jsx
│   │   └── api.js             all calls to the API
│   ├── test/                  unit tests and fixtures
│   ├── vercel.json            lets the website handle its own routes on Vercel
│   ├── nginx.conf             used by the Docker image of the website
│   └── Dockerfile
├── .github/workflows/ci.yml   the automatic checks
├── docker-compose.yml         the whole app on your computer
├── render.yaml                the API on Render (Blueprint)
└── uploads/                   photos when Cloudinary is not used (not in git)
```

## Run it on your computer
You need **Node.js 22** and a **MongoDB** server on your computer (or use [Docker](#run-it-with-docker) instead).

1. Install the packages:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```
2. Create the settings file for the API. Copy `backend/.env.example` to `backend/.env` and fill in `JWT_SECRET` with a long random string:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
3. Create your first admin user (run this from the project root, while MongoDB is running):
   ```bash
   node backend/utils/createAdmin.js admin YourPassword
   ```
4. Start the API and the website (two terminals, both from the project root):
   ```bash
   npm run backend      # API on http://localhost:5001
   npm run frontend     # website, Vite prints the address (usually http://localhost:5173)
   ```
5. Log in with the admin user you created.

The website talks to `http://localhost:5001/api` by default. Set `VITE_API_URL` in `frontend/.env` if your API runs somewhere else.

## Run it with Docker
Docker runs the database, the API and the website together, almost like the online version.

1. Create a file named `.env` in the project root with a long random secret (`.env.example` shows the format):
   ```
   JWT_SECRET=paste-a-long-random-string-here
   ```
2. Start everything:
   ```bash
   docker compose up --build
   ```
3. Website: <http://localhost:8080>. API check: <http://localhost:5001/api/health>.
4. Create an admin user inside the running API container:
   ```bash
   docker compose exec backend node utils/createAdmin.js admin YourPassword
   ```

The database in Docker is separate from the MongoDB on your computer, so it starts empty. Stop it with `docker compose down` (add `-v` to also delete its data). To use Cloudinary in Docker, add `CLOUDINARY_URL=...` to the root `.env`.

## Settings (environment variables)
Never commit a `.env` file: it contains secrets.

| Variable | Where | What it does |
|---|---|---|
| `MONGODB_URI` | API | Address of the database. Default: `mongodb://localhost:27017/libota` |
| `JWT_SECRET` | API | Secret used to sign login tokens. Use a long random string. |
| `PORT` | API | Port of the API (default 5001; Render sets it itself) |
| `NODE_ENV` | API | `production` online. In production the API refuses to start without `JWT_SECRET`. |
| `CLOUDINARY_URL` | API | `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`. Empty = photos stay on disk. |
| `CORS_ORIGIN` | API | Address(es) of the website that may call the API, comma separated, no trailing slash. Empty = everything is allowed (fine for development). |
| `UPLOADS_DIR` | API | Optional: folder for photos on disk (the tests use a temporary folder) |
| `VITE_API_URL` | Website | Address of the API including `/api`. It is baked into the website when it is built. |

## Photos
- **With `CLOUDINARY_URL` set**, new photos are uploaded to Cloudinary and the database stores the full web address.
- **Without it**, photos are saved in the `uploads` folder and the database stores `/uploads/<file>`.
- Both kinds can live side by side: the website uses `photoUrl()` (in `frontend/src/utils/photo.js`) to show either.
- Replacing a photo or deleting a person also removes the old image, unless another person still uses the same one.
- Free hosts wipe their disk on every restart, so online you need Cloudinary.
- To move photos that are already on disk to Cloudinary, set `CLOUDINARY_URL` and run:
  ```bash
  node backend/utils/migratePhotosToCloudinary.js --dry-run    # only lists what it would do
  node backend/utils/migratePhotosToCloudinary.js
  ```
  Then export a fresh backup.

## Tests
```bash
cd frontend && npm test     # Vitest: tree layout, last-name families, relationship sentences, PDF selection and page planning
cd backend && npm test      # login, users, JSON export/import, photos, gallery, suggestions, activity log, statistics, kinship, health check
```
- The API tests use a throwaway in-memory MongoDB, never your real database. The first run downloads a MongoDB binary (roughly 100 MB or more), so it takes a while.
- The tests never talk to Cloudinary; they use a temporary folder for photos.
- The 40-person test family used by the website tests is in `frontend/test/fixtures/fake-family-40.json`. It covers remarriages, single parents, a big sibling group, missing birth dates and an unlinked person.

## CI/CD and deployment
```mermaid
flowchart LR
    Browser --> Vercel["Vercel<br/>(website)"]
    Browser --> Render["Render<br/>(API in Docker)"]
    Render --> Atlas[("MongoDB Atlas<br/>(database)")]
    Render --> Cloudinary[("Cloudinary<br/>(photos)")]
```

### Automatic checks
`.github/workflows/ci.yml` runs on every pull request and on every push to `main`:
1. website: install, tests, production build
2. API: install, tests
3. Docker: both images build, and `docker-compose.yml` is valid

### Putting changes online
1. Make a branch, change the code and run the tests.
2. Open a pull request and wait for the green checks.
3. Merge into `main`. **`main` is what is live.**
4. Render rebuilds the API after the checks pass (`autoDeployTrigger: checksPass` in `render.yaml`). Vercel rebuilds the website on every push to `main`.

### Setting it up from scratch
1. **MongoDB Atlas.** Create a free cluster and a database user. Connection string:
   `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/libota?retryWrites=true&w=majority`
   Under *Network Access*, allow the addresses that may connect (see [Troubleshooting](#troubleshooting)).
2. **Cloudinary.** Create a free account. On *Settings → API Keys*, copy the **API environment variable** (fill in the key and secret).
3. **Render (API).** *New → Blueprint*, pick the repository. Enter `MONGODB_URI`, `CLOUDINARY_URL` and `CORS_ORIGIN` when asked (`JWT_SECRET` is generated). Check `https://<service>.onrender.com/api/health`.
4. **Vercel (website).** Import the repository, set **Root Directory** to `frontend`, and add `VITE_API_URL` = `https://<service>.onrender.com/api`.
5. Set `CORS_ORIGIN` on Render to the exact Vercel address (no trailing slash).
6. **First admin.** From your own computer, point at the online database for one command:
   ```powershell
   $env:MONGODB_URI = "mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/libota?retryWrites=true&w=majority"
   node backend/utils/createAdmin.js admin YourStrongPassword
   Remove-Item Env:MONGODB_URI
   ```
   Your computer must be in the Atlas access list for this.
7. Log in on the website and import your latest backup in the admin panel.

### Good to know about the free plans
- **Render** puts the API to sleep after about 15 minutes without requests. The first request afterwards can take a minute; just retry.
- **Atlas** free clusters have a 512 MB limit and no automatic backups: export JSON regularly.
- **Cloudinary** free plan: 25 credits per month, plenty for family photos.

## Backups and restoring data
- **Export:** admin panel → *Export JSON*. Do this before risky changes, and regularly, since the free database has no automatic backups.
- **Import:** admin panel → choose a mode, then *Import JSON*:
  - *Add to existing data* adds the people from the file and deletes nothing.
  - *Replace all existing data* inserts the people from the file first and only then removes the old people. It never deletes users. Users from the file that don't exist yet are created again with the password `ChangeMe123`: change it right away.
- Everyone in an import gets a new database id, and parent, child and partner links are rebuilt (and made two-way).
- API: `GET /api/export/json` and `POST /api/export/json` with `{ "data": { "people": [...], "users": [...] }, "mode": "add" | "replace" }` (admin only).

**Privacy:** a backup contains real names, dates and photo addresses. If the repository is public, keep backups out of git (add the backup folder to `.gitignore`).

## How the main parts work
- **Tree layout (`frontend/src/utils/treeLayout.js`, `graphLayout.js`).** `normalizeRelationships` cleans the raw data (ids as strings, links in both directions, two parents of one child become a couple). The layout builds the family structure: each node is a row of people (for example `ex-husband, ex-wife, person, new wife`) with the children of every partnership, and turns it into positions for the two views and the PDF. A last-name view (`families.js`) keeps only the oldest person of that name and their descendants.
- **PDF export (`frontend/src/utils/pdfExport.js`).** `getPeopleForExport` selects who is included (start N generations above a person, show M generations down). `planFamilyPdf` decides the pages for the chosen mode, and the PDF is drawn from the layout, so text stays sharp for big trees.
- **Photos (`backend/utils/photoStorage.js`).** One place that decides between Cloudinary and the disk, and removes old photos. Gallery photos are kept at up to 2560 pixels on the long side.
- **Import (`backend/routes/export.js`).** Validates the file, remaps ids, rebuilds links, inserts, and only then deletes (replace mode).
- **Kinship (`backend/utils/kinship.js`).** Turns a path between two people (up, down, spouse steps) into a relationship name, including half-, step- and in-law relatives. The website writes the sentence in the chosen language (`relationship.js`).

## Troubleshooting
| Problem | Likely cause and fix |
|---|---|
| Login gives a 500 with `SSL alert number 80` or `Could not connect to any servers` | The API cannot reach the database. In Atlas → *Network Access*, add the addresses of the API. Render publishes its outbound ranges under *Connect → Outbound*; add all of them, or allow `0.0.0.0/0` and rely on a strong database password. Adding them all is preferred. |
| The browser blocks requests ("CORS") | `CORS_ORIGIN` on Render must be exactly the website address, without a trailing slash. |
| A page gives 404 when refreshed (Vercel) | `frontend/vercel.json` is missing from the deployed branch. |
| The first request online is very slow | Render woke the sleeping API up. Retry after a minute. |
| `docker compose` says `JWT_SECRET` is missing | Create the `.env` file in the project root (see above). |
| Photos are saved as `/uploads/...` online | `CLOUDINARY_URL` is not set (or has a typo) on Render. |
| The website calls the wrong API | `VITE_API_URL` is baked in at build time: change it in Vercel and redeploy. |

## Working on the project
- Branch from `main`, run both test suites, open a pull request, merge after the checks are green.
- Commit the `package-lock.json` files (CI and Docker use `npm ci`) and never commit `.env`.
- Keep file names in exactly the same letter case as in the imports: Windows doesn't care, but Linux (Docker, CI, hosting) does.

## AI transparency notice
This project was built with AI assistance. The AI helped write and review code, tests and this documentation. All generated code was reviewed and tested by the developer. The architecture, the features and the design decisions are human-owned. If you find a mistake, please open an issue.
