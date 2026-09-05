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
const mountCareers = require('./careers/routes');
const mountVerification = require('./verification/routes');

module.exports = function mountV2(app, guards) {
  mountEvents(app, guards);
  mountJobs(app, guards);
  mountGiving(app, guards);
  mountCustomFields(app, guards);
  mountMentorship(app, guards);
  mountCommunity(app, guards);
  mountAudit(app, guards);
  // Career progression (REQ-08). Appended rather than inserted: /api/careers/*
  // collides with nothing above it, and appending leaves every existing
  // registration at the index `npm run routes` already records.
  mountCareers(app, guards);
  // Alumni verification queue. Also appended: /api/verification/* is a new
  // prefix, so nothing above it changes matching order. This is what lets a
  // reviewer approve the accounts that bulk import now creates unverified.
  mountVerification(app, guards);

  return { writeAudit, encryptField, decryptField, encryptionReady, ref };
};
