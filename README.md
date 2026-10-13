# Libota - Family Tree Application

Libota (meaning "family" in Lingala) is an interactive family tree application that allows you to create, manage, and visualize your family history.

## Features

- **Family Tree Management**: Add, edit, and delete family members with photos, birth/death dates, and descriptions
- **Interactive Visualization**: Zoom and pan through your family tree with multiple visualization styles
- **Relationship Finder**: Discover relationships between any two family members
- **Multi-language Support**: French, English, Lingala, and Dutch
- **User Management**: Admin accounts for full control, member accounts for adding family members
- **Data Export/Import**: JSON backup and restore functionality
- **PDF Export**: Export your family tree or partial sections to PDF
- **Image Storage**: Upload and store photos for each family member

## Tech Stack

- **Backend**: Node.js, Express, MongoDB
- **Frontend**: React, Vite, React Router
- **Libraries**: 
  - react-zoom-pan-pinch (tree visualization)
  - react-i18next (internationalization)
  - jspdf, html2canvas (PDF export)
  - @xyflow/react (graph visualization)

## Prerequisites

- Node.js (v18 or higher)
- MongoDB (local instance or MongoDB Atlas)
- Git

## Installation

1. Clone the repository:
```bash
git clone https://github.com/EmDev16/libota.git
cd libota
```

2. Install dependencies:
```bash
npm run install:all
```

3. Set up environment variables:

Create `backend/.env`:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/libota
JWT_SECRET=your_jwt_secret_change_this_in_production
NODE_ENV=development
```

4. Seed admin users:
```bash
npm run seed
```

Default admin accounts:
- Username: `admin`, Password: `LibotaAdmin2024!`
- Username: `admin2`, Password: `LibotaAdmin2024!`

## Running the Application

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

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

## Usage

1. **Login**: Use one of the admin accounts to log in
2. **Add Family Members**: Navigate to "People" → "Add Person"
3. **Build Your Tree**: Add relationships (parents, spouses, children) when creating/editing people
4. **Visualize**: Go to "Family Tree" to see the interactive visualization
5. **Find Relationships**: Use the "Relationship Finder" to discover connections between family members
6. **Manage Users**: Admins can add new family member accounts in the Admin Panel
7. **Export**: Use the Admin Panel to export your data as JSON backup

## Project Structure

```
libota/
├── backend/
│   ├── models/          # MongoDB models
│   ├── routes/          # API routes
│   ├── middleware/      # Authentication middleware
│   ├── server.js        # Express server
│   ├── seed.js          # Database seeding
│   └── .env             # Environment variables
├── frontend/
│   ├── src/
│   │   ├── pages/       # React page components
│   │   ├── components/  # Reusable components
│   │   ├── contexts/    # React contexts
│   │   ├── api.js       # API client
│   │   ├── i18n.js      # Internationalization
│   │   └── App.jsx      # Main app component
│   └── .env             # Environment variables
├── uploads/             # Image storage
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register new user (admin only)
- `GET /api/auth/me` - Get current user
- `GET /api/auth/users` - Get all users (admin only)
- `DELETE /api/auth/users/:id` - Delete user (admin only)

### People
- `GET /api/person` - Get all people
- `GET /api/person/:id` - Get single person
- `POST /api/person` - Create person
- `PUT /api/person/:id` - Update person
- `DELETE /api/person/:id` - Delete person (admin only)

### Tree
- `GET /api/tree/complete` - Get complete tree data
- `GET /api/tree/from/:id` - Get tree from specific person
- `GET /api/tree/relationship/:id1/:id2` - Find relationship between two people
- `GET /api/tree/filter/:type` - Filter by relationship type

### Export
- `GET /api/export/json` - Export all data as JSON (admin only)
- `POST /api/export/json` - Import data from JSON (admin only)

## Deployment

### Free Hosting Options

The application can be deployed to free tiers of:

1. **Render** (recommended)
   - Backend: Render (Node.js)
   - Database: MongoDB Atlas (free tier)
   - Frontend: Vercel or Netlify

2. **Railway**
   - Full stack deployment with MongoDB

3. **Heroku** (limited free tier)
   - Backend: Heroku
   - Database: MongoDB Atlas
   - Frontend: Vercel

See deployment guide in the project documentation for detailed instructions.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC

## Support

For issues and questions, please open an issue on GitHub.
