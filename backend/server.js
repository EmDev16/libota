// Starts the real server: loads the settings, connects to MongoDB and opens the port.
require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const WEAK_SECRETS = ['your_jwt_secret', 'your_jwt_secret_change_this_in_production'];
const secret = process.env.JWT_SECRET;
if (
  process.env.NODE_ENV === 'production' &&
  (!secret || secret.length < 32 || WEAK_SECRETS.includes(secret))
) {
  console.error('JWT_SECRET is missing, shorter than 32 characters, or still an example value. Refusing to start in production.');
  process.exit(1);
}

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/libota')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});