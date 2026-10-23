const mongoose = require('mongoose');

// A photo in the family gallery (added by an admin, or by a member's suggestion that an admin approved)
const galleryPhotoSchema = new mongoose.Schema({
  image: { type: String, required: true }, // Cloudinary address or /uploads/<file>
  // Size in pixels, only used to lay the grid out before the pictures have loaded
  width: { type: Number, default: null },
  height: { type: Number, default: null },

  caption: { type: String, default: '', trim: true },
  takenYear: { type: Number, default: null },
  takenDate: { type: Date, default: null },
  album: { type: String, default: '', trim: true },
  tags: { type: [String], default: [] }, // visible tags, stored without the #
  // Hidden tags: never shown to members. They decide who sees the photo (e.g. a family name),
  // and the tag "timeline" puts the photo on the timeline page.
  hiddenTags: { type: [String], default: [] },

  // People on the photo. x and y (0-100, percent of the picture) place the name on it;
  // without them the person is in the photo but not placed. personId stays empty for somebody
  // outside the family: only the name is kept, no person is created.
  people: {
    type: [
      {
        personId: { type: mongoose.Schema.Types.ObjectId, ref: 'Person', default: null },
        name: { type: String, required: true },
        x: { type: Number, default: null },
        y: { type: Number, default: null },
        _id: false
      }
    ],
    default: []
  },

  // What the gallery is sorted on: the exact date, else January of the year, else the upload time
  sortDate: { type: Date, default: Date.now, index: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

galleryPhotoSchema.pre('validate', function setSortDate() {
  if (this.takenDate) this.sortDate = this.takenDate;
  else if (this.takenYear) this.sortDate = new Date(Date.UTC(this.takenYear, 0, 1));
  else this.sortDate = this.createdAt || new Date();
});

module.exports = mongoose.model('GalleryPhoto', galleryPhotoSchema);
