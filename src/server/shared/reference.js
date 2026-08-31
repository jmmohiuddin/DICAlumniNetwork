/* Reference-code generator — ticket codes, transaction refs, receipt codes. */
const crypto = require('crypto');

const ref = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

module.exports = { ref };
