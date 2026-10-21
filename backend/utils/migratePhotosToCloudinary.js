// One-time move of the photos on disk (uploads folder) to Cloudinary.
// Run it against the database you want to move, BEFORE you export your backup:
//
//   1. put CLOUDINARY_URL in backend/.env
//   2. node backend/utils/migratePhotosToCloudinary.js --dry-run     (only lists what it would do)
//   3. node backend/utils/migratePhotosToCloudinary.js
//
// It is safe to run again: only photos that are still "/uploads/..." are touched.
const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const mongoose = require('mongoose');
const Person = require('../models/Person');
const { getUploadDir, savePhoto, useCloudinary } = require('./photoStorage');

const MIME_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
const dryRun = process.argv.includes('--dry-run');

(async () => {
  if (!useCloudinary()) {
    console.error('CLOUDINARY_URL is not set. Add it to backend/.env first.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/libota');
    console.log('Connected to database:', mongoose.connection.name, dryRun ? '(dry run)' : '');

    const people = await Person.find({ photo: /^\/uploads\// });
    console.log(`${people.length} photo(s) on disk to move`);

    let moved = 0;
    let missing = 0;
    let failed = 0;

    for (const person of people) {
      const fileName = path.basename(person.photo);
      const filePath = path.join(getUploadDir(), fileName);
      const label = `${person.firstName} ${person.lastName} (${fileName})`;

      if (!fs.existsSync(filePath)) {
        console.warn('  missing file, skipped:', label);
        missing++;
        continue;
      }
      if (dryRun) {
        console.log('  would move:', label);
        continue;
      }

      try {
        const buffer = await fs.promises.readFile(filePath);
        const mimetype = MIME_TYPES[path.extname(fileName).toLowerCase()] || 'image/jpeg';
        const url = await savePhoto({ buffer, mimetype });
        await Person.updateOne({ _id: person._id }, { photo: url });
        console.log('  moved:', label);
        moved++;
      } catch (error) {
        console.error('  FAILED:', label, error.message);
        failed++;
      }
    }

    console.log(`\nDone. moved: ${moved}, missing file: ${missing}, failed: ${failed}`);
    if (!dryRun && moved > 0) {
      console.log('The files in the uploads folder were left in place. Export a new backup now.');
    }
  } catch (error) {
    console.error('Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();