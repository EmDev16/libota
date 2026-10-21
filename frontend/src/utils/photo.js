import { IMAGE_BASE_URL } from '../api';

// A photo address is either a full https address (Cloudinary) or a path like
// "/uploads/123.jpg" on our own server. Both kinds can exist side by side.
export const photoUrl = (photo) => {
  if (!photo) return '';
  return /^https?:\/\//i.test(photo) ? photo : `${IMAGE_BASE_URL}${photo}`;
};