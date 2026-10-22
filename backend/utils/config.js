// The secret that signs the login tokens.
// In production it must be set (server.js also refuses to start without a strong one).
// While developing or testing a fallback is used so you do not have to set it up first.
const DEV_FALLBACK = 'dev-only-secret-do-not-use-online';

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not set');
  }
  return DEV_FALLBACK;
}

module.exports = { getJwtSecret };
