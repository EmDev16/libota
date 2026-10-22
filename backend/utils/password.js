// One place that decides what a good enough password is.
// bcrypt only looks at the first 72 bytes, so longer passwords are refused instead of silently cut.
const MIN_LENGTH = 8;
const MAX_BYTES = 72;

// Returns an error message, or null when the password is fine
function passwordProblem(password) {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters`;
  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) return 'Password is too long (maximum 72 bytes)';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
}

module.exports = { passwordProblem, MIN_LENGTH };
