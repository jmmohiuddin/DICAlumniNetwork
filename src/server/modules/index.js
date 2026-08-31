/* ============================================================
   DIC ALUMNI PLATFORM — ROUTES v2 (module index)

   Replaces the former monolithic _routes_v2.js. Mounts each domain's routes,
   in the same order they were previously registered, so Express route
   matching order is unchanged. Returns the same shape the old mountV2 did —
   server.js consumes writeAudit, encryptField, decryptField, encryptionReady
   from it.
   ============================================================ */

const { encryptField, decryptField, encryptionReady } = require('../shared/crypto');
const { writeAudit } = require('../shared/audit');
const { ref } = require('../shared/reference');

const mountEvents = require('./events/routes');
const mountJobs = require('./jobs/routes');
const mountGiving = require('./giving/routes');
const mountCustomFields = require('./custom-fields/routes');
const mountMentorship = require('./mentorship/routes');
const mountCommunity = require('./community/routes');
const mountAudit = require('./audit/routes');

module.exports = function mountV2(app, guards) {
  mountEvents(app, guards);
  mountJobs(app, guards);
  mountGiving(app, guards);
  mountCustomFields(app, guards);
  mountMentorship(app, guards);
  mountCommunity(app, guards);
  mountAudit(app, guards);

  return { writeAudit, encryptField, decryptField, encryptionReady, ref };
};
