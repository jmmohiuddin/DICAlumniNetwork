# 🎓 Daffodil International College (DIC) Alumni Platform

> **Institution:** Daffodil International College (DIC)  
> **Architecture:** Single-Institution Enterprise Platform  
> **Security & RBAC:** 5-Level Role-Based Access Control (Alumni, Moderator, Department Admin, College Admin, Super Admin)  
> **Design System:** Dark Glassmorphic Mobile-First · DIC Green (`#00A859`) & DIC Blue (`#005691`)  
> **Compliance:** PDPA 2026 (Personal Data Protection Act) · Cybersecurity Act 2023

---

## 📌 Executive Overview

**DIC Alumni Platform** is the official alumni networking, fundraising, career management, and bulk user import system exclusively built for **Daffodil International College (DIC)**.

---

## 🚀 Key Modules & Features

### 📥 1. Bulk User Import & Automatic Profile Creation (`Admin Panel -> Bulk Import`)
- **Supported Formats:** CSV (`.csv`), Microsoft Excel (`.xlsx`, `.xls`).
- **Downloadable Sample Template:** Download `sample_alumni_import_template.csv` directly from the admin panel.
- **Comprehensive 43-Field Support:** Basic, Academic, Professional, Contact, Personal, Location, Social, Emergency Contact, and Networking Preferences.
- **Validation Engine:** Real-time checking for required fields, email format, phone format, CGPA numerical ranges, and passing years.
- **4-Priority Duplicate Detection:** Auto-detects duplicates by Student ID > Roll Number > Email > Mobile Number.
- **Duplicate Handling Strategies:** Skip duplicates, update existing profiles, or merge records.
- **Automated Credential Generation:** Configurable password strategy (Static Temp Password `12345678`, `StudentID + Suffix`, or `Cryptographic Random`).
- **Downloadable Error Report:** Generates `bulk_import_error_report.csv` for invalid rows detailing exact errors & suggested fixes.
- **Import Audit History:** Complete historical log of past import batches (Date, Admin, Total/Success/Failed/Duplicates, Processing Speed).

### 👤 2. Comprehensive 10-Section User Profile System (`My Profile`)
- **10 Profile Sections:**
  1. **Basic & Academic Identity**: Photo, Cover Photo, Full Name, Nickname, Student ID, Roll, Reg No, Batch, Department, Degree, Status, DOB, Gender, Blood Group, Bio.
  2. **Contact & Emergency**: Primary Email, Secondary Email, Mobile, Alt Phone, Emergency Contact Name/Phone/Relation.
  3. **Address & Location**: Present & Permanent Address, Hometown, City, District, Division, Country, Postal Code.
  4. **Academic Record**: Institution Name, Department, Degree, CGPA, Graduation Year, Admission Year, Student Clubs, Scholarships, Awards, Publications.
  5. **Professional & CV**: Current Company, Job Title, Employment Type, Industry, Experience, Previous Companies, Skills, Certifications, Resume/CV Upload, Portfolio.
  6. **Networking & Hiring**: Open to Mentor, Looking for Job, Actively Hiring, Startup Collaboration, Freelancing, Speaking.
  7. **Social Profiles**: LinkedIn, Facebook, GitHub, X (Twitter), Instagram, YouTube, Behance, Dribbble, Medium, Kaggle, Stack Overflow, Custom Links.
  8. **Skills & Interests**: Technical Skills, Soft Skills, Languages, Hobbies, Sports, Volunteer Work, Areas of Interest.
  9. **Granular Privacy Controls**: Select field-level visibility (*Public*, *Alumni Only*, *Same Batch*, *Connections*, *Teachers*, *Private*).
  10. **Admin Custom Fields**: Dynamic no-code custom field builder for administrators to add new profile schema fields on the fly.
- **Verification Badges:** Display verification status pills (Email Verified ✓, Phone Verified ✓, Student ID Verified ✓, Alumni Board Verified ✓).

---

## 🔐 5-Level Role-Based Access Control (RBAC) & Demo Logins

| Role Level | Role Title | Demo Email | Password | Access Rights & Dashboard View |
|---|---|---|---|---|
| **Level 1** | **Alumni** | `alumni@dic.edu.bd` | `12345678` | Profile completion, Networking, Directory, Mentorship, Events, Jobs, Career Tracker, DIC News & Live Polls. |
| **Level 2** | **Moderator** | `moderator@dic.edu.bd` | `12345678` | **Moderator Dashboard**: Pending profile approvals queue, reported posts, community safety index (99.4%), content moderation tools. |
| **Level 3** | **Department Admin** | `departmentadmin@dic.edu.bd` | `12345678` | **Dept Admin Dashboard (CSE/SWE/BBA/EEE)**: Department placement funnel, department verification queue, department announcements. |
| **Level 4** | **College Admin** | `collegeadmin@dic.edu.bd` | `12345678` | **College Command Center**: DIC-wide alumni count (38,420), total funds (৳45.2L), 12-month engagement trends, college broadcasts. |
| **Level 5** | **Super Admin** | `admin@dic.edu.bd` | `12345678` | **Super Admin Control Panel**: Bulk User Import, Dynamic Custom Fields, Infrastructure & server health, immutable audit logs, feature flags, database tools. |

---

## 💻 How to Run Locally

```bash
# Start local web server
python3 -m http.server 8000
```
Then visit **`http://localhost:8000`** in your browser.
