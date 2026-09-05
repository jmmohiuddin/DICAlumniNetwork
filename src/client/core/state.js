/*
 * state.js — extracted verbatim from the original app.js, lines 1-59.
 *
 * Header banner, 'use strict', MOCK_* demo data (users/campaigns/verification
 * queue/tenants/career timeline), chapter cache globals, and the shared `state`
 * object.
 */

/* ============================================================
   DAFFODIL INTERNATIONAL COLLEGE — ALUMNI PLATFORM
   Single-Institution System with 5-Level Role-Based Access Control
   ============================================================ */

'use strict';

// ─── DEMO ACCOUNTS (5 RBAC HIERARCHY LEVELS) ────────────────
const MOCK_USERS = {
  super_admin: { email: 'admin@dic.edu.bd', name: 'Super Admin', initials: 'SA', role: 'super_admin', roleLabel: 'Super Admin', dept: 'System & Security', icon: '👑' },
  univ_admin: { email: 'collegeadmin@dic.edu.bd', name: 'College Admin', initials: 'CA', role: 'univ_admin', roleLabel: 'College Admin', dept: 'DIC Administration', icon: '🏛' },
  dept_admin: { email: 'departmentadmin@dic.edu.bd', name: 'Dr. Shahabuddin', initials: 'DA', role: 'dept_admin', roleLabel: 'Dept Admin (CSE)', dept: 'CSE Department', icon: '🏢' },
  moderator: { email: 'moderator@dic.edu.bd', name: 'Content Moderator', initials: 'CM', role: 'moderator', roleLabel: 'Moderator', dept: 'DIC Community', icon: '🛡' },
  alumni: { email: 'alumni@dic.edu.bd', name: 'Mohiuddin Rahman', initials: 'MR', role: 'alumni', roleLabel: 'Alumni', dept: 'BSc CSE (2020)', icon: '🎓' }
};


const MOCK_CAMPAIGNS = [
  { id: 1, name: 'DIC Merit Scholarship Fund 2026', desc: 'Provide full tuition scholarships to 50 meritorious DIC students from underprivileged backgrounds.', tag: 'scholarship', raised: 1840000, goal: 2500000, donors: 342, days: 18, gateways: ['bkash', 'nagad', 'card'] },
  { id: 2, name: 'DIC Smart Robotics Lab Fund', desc: 'Equip the campus robotics laboratory with modern research-grade instruments and microcontrollers.', tag: 'infrastructure', raised: 680000, goal: 1200000, donors: 189, days: 31, gateways: ['bkash', 'nagad', 'rocket'] },
  { id: 3, name: 'DIC Entrepreneurship Seed Fund', desc: 'Launch a startup incubator at DIC providing seed funding and mentorship for student tech startups.', tag: 'education', raised: 920000, goal: 1500000, donors: 210, days: 45, gateways: ['bkash', 'card'] }
];




// Chapters loaded from PostgreSQL by renderChapters(). Was a hardcoded array.
let chaptersCache = [];
// The signed-in user's chapter memberships, also from PostgreSQL.
let USER_CHAPTER_MEMBERSHIPS = new Set();

const MOCK_VERIFICATION_QUEUE = [
  { name: 'Rafiq Hossain', initials: 'RH', details: 'CSE Batch 2021 · Unmatched ID' },
  { name: 'Sumaiya Zaman', initials: 'SZ', details: 'BBA Batch 2022 · Pending NID' }
];

/* The one institution this deployment serves. Not a tenant registry — there is
 * no multi-tenancy in this codebase (no tenant_id column exists on any of the
 * 38 tables, and no RLS policy anywhere), so this is a description of the
 * single install, not a list something could be added to.
 *
 * `alumni` was the literal 38420. It is null here and filled from
 * /api/stats/platform at render time, because a made-up headcount on the
 * institution's own record is the least defensible number on the platform. */
const DIC_INSTITUTION = [
  { name: 'Daffodil International College', subdomain: 'alumni.dic.edu.bd', alumni: null, status: 'active', plan: 'Single-institution deployment' }
];
// Kept as an alias: three modules still read this name.
const MOCK_TENANTS = DIC_INSTITUTION;
// MOCK_CAREER_TIMELINE was two hardcoded jobs shown as every user's career
// history. Real history now lives in the employment_history table, read via
// /api/careers/mine.

// ─── APP STATE ──────────────────────────────────────────────
let state = {
  currentPage: 'dashboard',
  currentUser: null, // populated only by a successful /api/auth/login or /api/auth/me
  charts: {},
  searchTimeout: null,
  selectedGateway: null,
  selectedAmount: null,
  analyticsChart: null,
  connectedAlumni: {},
  // Server-side directory query state (search/filter/sort/paging).
  directory: { search: '', batch: '', domain: '', mentor: false, sort: 'name', limit: 12, offset: 0 },
};


