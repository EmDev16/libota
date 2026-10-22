// Slows down people who guess passwords. Kept in memory: fine for one server (Render free plan).
// Failed logins are counted per IP address + username, and also per IP address on its own.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_USER = 5; // wrong passwords for one username from one address
const MAX_PER_IP = 30; // wrong passwords from one address, any username

const failures = new Map(); // key -> { count, resetAt }

const keyFor = (req, username) => `${req.ip}|${String(username || '').toLowerCase().slice(0, 100)}`;

function current(key) {
  const entry = failures.get(key);
  if (!entry) return null;
  if (entry.resetAt <= Date.now()) {
    failures.delete(key);
    return null;
  }
  return entry;
}

function bump(key) {
  const entry = current(key);
  if (entry) entry.count += 1;
  else failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
}

// Put before the login handler: stops the request when there were too many failures
function loginLimiter(req, res, next) {
  const userEntry = current(keyFor(req, req.body?.username));
  const ipEntry = current(`${req.ip}|*`);
  const blocked =
    (userEntry && userEntry.count >= MAX_PER_USER) || (ipEntry && ipEntry.count >= MAX_PER_IP);

  if (blocked) {
    const resetAt = Math.max(userEntry?.resetAt || 0, ipEntry?.resetAt || 0);
    res.set('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }
  next();
}

const recordLoginFailure = (req, username) => {
  bump(keyFor(req, username));
  bump(`${req.ip}|*`);
};

// A successful login clears the counter of that user (not the one of the address)
const clearLoginFailures = (req, username) => failures.delete(keyFor(req, username));

const resetLoginLimiter = () => failures.clear();

// Forget old entries now and then so memory does not grow
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key);
}, 5 * 60 * 1000).unref();

module.exports = { loginLimiter, recordLoginFailure, clearLoginFailures, resetLoginLimiter };
