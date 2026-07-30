-- ============================================================
-- DAFFODIL INTERNATIONAL COLLEGE (DIC) ALUMNI PLATFORM
-- PostgreSQL Database Seed Script
-- ============================================================

-- 1. SEED RBAC USERS
INSERT INTO users (id, email, password_hash, full_name, initials, role, role_label, department, icon, is_verified)
VALUES 
  (1, 'admin@dic.edu.bd', '12345678', 'Super Admin', 'SA', 'super_admin', 'Super Admin', 'System & Security', '👑', true),
  (2, 'collegeadmin@dic.edu.bd', '12345678', 'College Admin', 'CA', 'univ_admin', 'College Admin', 'DIC Administration', '🏛', true),
  (3, 'departmentadmin@dic.edu.bd', '12345678', 'Dr. Shahabuddin', 'DA', 'dept_admin', 'Dept Admin (CSE)', 'CSE Department', '🏢', true),
  (4, 'moderator@dic.edu.bd', '12345678', 'Content Moderator', 'CM', 'moderator', 'Moderator', 'DIC Community', '🛡', true),
  (5, 'alumni@dic.edu.bd', '12345678', 'Mohiuddin Rahman', 'MR', 'alumni', 'Alumni Member', 'BSc CSE (2020)', '🎓', true)
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- 2. SEED ALUMNI PROFILES
INSERT INTO alumni_profiles (
  user_id, student_id, roll_number, registration_number, batch, passing_year, department, program, section_code,
  current_status, dob, gender, blood_group, bio, primary_email, secondary_email, mobile_number, alt_mobile,
  emergency_name, emergency_phone, emergency_relation, present_address, permanent_address, hometown, city, district,
  division, country, postal_code, degree, cgpa, admission_year, clubs, scholarship, awards, publications,
  current_company, job_title, employment_type, industry, years_experience, skills, certifications,
  looking_for_job, hiring, can_mentor, looking_for_mentor, collaboration, linkedin, facebook, github, twitter, website, color
) VALUES
  (
    5, 'DIC-2020-0847', '847', 'REG-2020-0847', 2020, 2020, 'Computer Science & Engineering', 'BSc CSE', 'A',
    'Alumni & Tech Lead', '1998-08-14', 'Male', 'O+', 'Full-stack software architect specializing in cloud systems, React, Node.js, and enterprise security.',
    'mohiuddin@dic.edu.bd', 'mohiuddin.dev@gmail.com', '+880 1712-345678', '+880 1812-345678',
    'Abdur Rahman', '+880 1912-345678', 'Father', 'House 42, Road 11, Dhanmondi, Dhaka-1209', 'Comilla, Bangladesh',
    'Comilla', 'Dhaka', 'Comilla', 'Chittagong', 'Bangladesh', '1209', 'BSc in Computer Science & Engineering', '3.92 / 4.00', 2016,
    'DIC Computer Club (President), Robotics Club', 'DIC Chairman Merit Scholarship (100% Waiver)', '1st Runner Up - National Programming Contest 2019',
    'AI-Based Crop Disease Detection (IEEE 2020)', 'Brain Station 23', 'Senior Software Engineer', 'Full-time',
    'Software & Tech', '5 Years', 'React, Node.js, PostgreSQL, AWS, Docker', 'AWS Certified Solutions Architect',
    false, true, true, false, true, 'https://linkedin.com/in/mohiuddin-rahman', 'https://facebook.com/mohiuddin.dic', 'https://github.com/mohiuddin-dic', 'https://x.com/mohiuddin_dev', 'https://mohiuddin.dev', '#00A859'
  )
ON CONFLICT (student_id) DO NOTHING;

-- 3. SEED CHAPTERS
INSERT INTO chapters (id, name, type, icon, description, members_count, events_count, parent_id, status)
VALUES
  (1, 'DIC Main Campus Chapter', 'regional', '🏫', 'Official main campus alumni chapter', 18420, 14, NULL, 'approved'),
  (2, 'DIC Dhanmondi Branch Alumni', 'regional', '🌆', 'Dhanmondi campus alumni network', 12400, 8, NULL, 'approved'),
  (3, 'DIC CSE Alumni Association', 'interest', '💻', 'Computer Science & Engineering alumni', 6210, 18, NULL, 'approved'),
  (4, 'DIC SWE Engineers Club', 'interest', '🚀', 'Software Engineering graduates club', 4120, 12, NULL, 'approved'),
  (5, 'DIC UK & Europe Alumni', 'regional', '🇬🇧', 'United Kingdom & European alumni network', 840, 5, NULL, 'approved')
ON CONFLICT (id) DO NOTHING;

SELECT setval('chapters_id_seq', (SELECT MAX(id) FROM chapters));

-- 4. SEED STORIES (NEWS FEED)
INSERT INTO stories (id, emoji, category, title, excerpt, content, author_name, status, published_date)
VALUES
  (1, '🌟', 'DIC Spotlight', 'DIC Alumna Appointed AI Research Lead at Google DeepMind', 'Liana Choudhury (CSE Batch 2018) has been appointed AI Research Lead. She credits DIC''s hands-on lab environment and mentorship program.', 'Full article content about Liana''s journey from DIC to Google DeepMind...', 'DIC Press Office', 'published', '28 Jul 2026'),
  (2, '🏆', 'Achievement', 'DIC Ranks #1 College in Computer Science Innovation 2026', 'Daffodil International College achieved top research output in computer science and software engineering in the national index.', 'Full achievement breakdown...', 'DIC Academic Council', 'published', '24 Jul 2026')
ON CONFLICT (id) DO NOTHING;

SELECT setval('stories_id_seq', (SELECT MAX(id) FROM stories));

-- 5. SEED JOBS
INSERT INTO jobs (id, emoji, title, company, salary, type, location, posted_by_name, batch, tags, days_ago)
VALUES
  (1, '💻', 'Senior Backend Engineer', 'Brain Station 23', '৳1.8L/mo', 'fulltime', 'Dhaka', 'Tanvir Ahmed', 2017, ARRAY['Node.js', 'PostgreSQL', 'AWS'], 2),
  (2, '📊', 'Data Scientist', 'Pathao', '৳1.4L/mo', 'fulltime', 'Dhaka', 'Arif Hossain', 2018, ARRAY['Python', 'Machine Learning'], 4),
  (3, '🎨', 'UI/UX Design Intern', 'SSL Wireless', '৳25K/mo', 'internship', 'Dhaka', 'Priya Das', 2021, ARRAY['Figma', 'UX'], 1)
ON CONFLICT (id) DO NOTHING;

SELECT setval('jobs_id_seq', (SELECT MAX(id) FROM jobs));

-- 6. SEED EVENTS
INSERT INTO events (id, emoji, title, event_date, event_time, venue, capacity, registered_count, price, status, type)
VALUES
  (1, '🎓', 'DIC 10th Annual Reunion 2026', 'Aug 15, 2026', '6:00 PM', 'DIC Main Auditorium', 2000, 1840, '৳500', 'upcoming', 'Gala'),
  (2, '💼', 'DIC CSE & SWE Job Fair Q3', 'Aug 22, 2026', '10:00 AM', 'DIC Campus Center', 1200, 890, 'Free', 'upcoming', 'Professional'),
  (3, '🚀', 'DIC AI & Cloud Tech Symposium', 'Aug 30, 2026', '9:00 AM', 'DIC International Hall', 400, 395, '৳300', 'upcoming', 'Conference')
ON CONFLICT (id) DO NOTHING;

SELECT setval('events_id_seq', (SELECT MAX(id) FROM events));

-- 7. SEED CAMPAIGNS
INSERT INTO campaigns (id, name, description, tag, raised_amount, goal_amount, donors_count, days_left, gateways)
VALUES
  (1, 'DIC Merit Scholarship Fund 2026', 'Provide full tuition scholarships to 50 meritorious DIC students from underprivileged backgrounds.', 'scholarship', 1840000, 2500000, 342, 18, ARRAY['bkash', 'nagad', 'card']),
  (2, 'DIC Smart Robotics Lab Fund', 'Equip the campus robotics laboratory with modern research-grade instruments and microcontrollers.', 'infrastructure', 680000, 1200000, 189, 31, ARRAY['bkash', 'nagad', 'rocket']),
  (3, 'DIC Entrepreneurship Seed Fund', 'Launch a startup incubator at DIC providing seed funding and mentorship for student tech startups.', 'education', 920000, 1500000, 210, 45, ARRAY['bkash', 'card'])
ON CONFLICT (id) DO NOTHING;

SELECT setval('campaigns_id_seq', (SELECT MAX(id) FROM campaigns));

-- 8. SEED NOTIFICATIONS
INSERT INTO notifications (id, user_id, target_role, icon, title, subtitle, is_unread)
VALUES
  (1, 5, 'alumni', '🤝', 'Mentorship Accepted', 'Fatima Khanam accepted your connection', true),
  (2, 5, 'alumni', '💰', 'Donation Receipt', 'Your ৳5,000 to DIC Merit Fund confirmed', true)
ON CONFLICT (id) DO NOTHING;

SELECT setval('notifications_id_seq', (SELECT MAX(id) FROM notifications));

-- 9. SEED CUSTOM FIELDS
INSERT INTO custom_fields (id, label, section, field_type, is_required)
VALUES
  ('cf_1', 'Research Publications', 'academic', 'text', false),
  ('cf_2', 'Scholarship / Award Name', 'academic', 'text', false),
  ('cf_3', 'Startup Pitch Deck / Video Link', 'networking', 'url', false)
ON CONFLICT (id) DO NOTHING;
