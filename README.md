# Libota

Libota is a full-stack family tree application built to help families record, explore, and manage relationships across generations. The project currently includes a protected React dashboard, a visual family tree, person management, relationship tracing, multilingual UI, and an admin panel for user and data management.

The app name comes from Lingala, where "libota" means "family".

## Current features

- Family member creation, editing, and deletion
- Photo uploads and basic profile data (birth date, death date, notes, etc.)
- Interactive family tree views in both traditional and modern layouts
- Relationship finder to check how two people are connected
- Dashboard with quick navigation to key workflows
- Admin-only controls for user creation and deletion
- JSON backup/export and JSON import with add or replace modes
- Multi-language support using i18n
- Protected routes with login-based access control

## Tech stack

- Backend: Node.js, Express, MongoDB, Mongoose
- Frontend: React, Vite, React Router
- Visualization: React Flow, react-zoom-pan-pinch
- Auth: JWT + bcrypt
- File handling: Multer
- PDF/HTML export tooling: jspdf and html2canvas
- Internationalization: i18next

## Project layout

```bash
libota/
├── backend/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   ├── .env.example (if added locally)
│   ├── server.js
│   ├── seed.js
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── uploads/
├── json-backups-until-production/
├── README.md
├── package.json
└── .gitignore
```

## App flow

The frontend currently includes these routes:

- `/login` – sign in screen
- `/dashboard` – overview with cards for core sections
- `/tree` – family tree visualization
- `/people` – list of registered people
- `/people/new` – add a new family member
- `/people/:id/edit` – update an existing person
- `/relationship` – relationship lookup tool
- `/admin` – admin-only management panel

## Prerequisites

- Node.js 18+
- MongoDB running locally or via MongoDB Atlas
- Git

## Setup

1. Clone the repository:

```bash
git clone <your-repo-url>
cd libota
```

2. Install dependencies for both apps:

```bash
npm run install:all
```

3. Create the backend environment file:

```bash
# backend/.env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/libota
JWT_SECRET=your_super_secret_jwt_key
NODE_ENV=development
```

4. Seed the database with starter admin accounts:

```bash
npm run seed
```

Default seeded admin accounts:

- Username: `admin` / Password: `LibotaAdmin2024!`
- Username: `admin2` / Password: `LibotaAdmin2024!`

## Run locally

### Backend

```bash
cd backend
npm start
```

### Frontend

```bash
cd frontend
npm run dev
```

Then open:

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

## Data and admin features

This project currently supports:

- creating users in the admin panel
- deleting users from the admin panel
- exporting your family data as a JSON backup
- importing JSON family data in add or replace mode
- viewing a protected dashboard for logged-in users

## Main API areas

### Authentication

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`
- `GET /api/auth/users`
- `DELETE /api/auth/users/:id`

### People

- `GET /api/person`
- `GET /api/person/:id`
- `POST /api/person`
- `PUT /api/person/:id`
- `DELETE /api/person/:id`

### Tree

- `GET /api/tree/complete`
- `GET /api/tree/from/:id`
- `GET /api/tree/relationship/:id1/:id2`

### Export/import

- `GET /api/export/json`
- `POST /api/export/json`

## Notes for current development

This repo is in active project mode and is being iterated around a real family-data workflow. The current implementation already includes the main user-facing pieces for managing a family tree, but you may still see ongoing improvements around data modeling, import handling, and UX polish.

## License

ISC

## Contributing

Pull requests and improvements are welcome. If you are extending the app, keep the existing admin/auth flow and family data conventions in mind when adding new features.
