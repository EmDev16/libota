// Starts the real server: loads the settings, connects to MongoDB and opens the port.
require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/libota')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});