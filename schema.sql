-- ============================================================
-- DAFFODIL INTERNATIONAL COLLEGE (DIC) ALUMNI PLATFORM
-- PostgreSQL Production Database Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS & ACCOUNT HIERARCHY
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL DEFAULT '12345678',
    full_name VARCHAR(255) NOT NULL,
    initials VARCHAR(10) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin')),
    role_label VARCHAR(100) NOT NULL,
    department VARCHAR(150) NOT NULL,
    icon VARCHAR(10) NOT NULL DEFAULT '🎓',
    is_verified BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. ALUMNI PROFILES (FULL 10-SECTION DATA MODEL)
CREATE TABLE IF NOT EXISTS alumni_profiles (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    student_id VARCHAR(50) UNIQUE NOT NULL,
    roll_number VARCHAR(50),
    registration_number VARCHAR(50),
    batch INT NOT NULL,
    passing_year INT NOT NULL,
    department VARCHAR(150) NOT NULL,
    program VARCHAR(150),
    section_code VARCHAR(10),
    current_status VARCHAR(150),
    dob DATE,
    gender VARCHAR(20),
    blood_group VARCHAR(10),
    bio TEXT,
    
    -- Contact & Emergency
    primary_email VARCHAR(255) NOT NULL,
    secondary_email VARCHAR(255),
    mobile_number VARCHAR(50),
    alt_mobile VARCHAR(50),
    emergency_name VARCHAR(150),
    emergency_phone VARCHAR(50),
    emergency_relation VARCHAR(50),
    
    -- Address
    present_address TEXT,
    permanent_address TEXT,
    hometown VARCHAR(100),
    city VARCHAR(100),
    district VARCHAR(100),
    division VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Bangladesh',
    postal_code VARCHAR(20),
    
    -- Academic
    degree VARCHAR(255),
    cgpa VARCHAR(20),
    admission_year INT,
    clubs TEXT,
    scholarship TEXT,
    awards TEXT,
    publications TEXT,
    
    -- Professional
    current_company VARCHAR(255),
    job_title VARCHAR(255),
    employment_type VARCHAR(100),
    industry VARCHAR(150),
    years_experience VARCHAR(50),
    skills TEXT,
    certifications TEXT,
    
    -- Networking
    looking_for_job BOOLEAN DEFAULT FALSE,
    hiring BOOLEAN DEFAULT FALSE,
    can_mentor BOOLEAN DEFAULT TRUE,
    looking_for_mentor BOOLEAN DEFAULT FALSE,
    collaboration BOOLEAN DEFAULT TRUE,
    
    -- Social
    linkedin VARCHAR(255),
    facebook VARCHAR(255),
    github VARCHAR(255),
    twitter VARCHAR(255),
    website VARCHAR(255),

    -- Privacy Settings JSON
    privacy_settings JSONB DEFAULT '{"mobile":"private","email":"alumni","address":"private","cgpa":"private","linkedin":"public","github":"public"}'::jsonb,

    color VARCHAR(20) DEFAULT '#00A859',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. CHAPTERS & HIERARCHY
CREATE TABLE IF NOT EXISTS chapters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('regional', 'batch', 'interest')),
    icon VARCHAR(20) NOT NULL DEFAULT '🏫',
    description TEXT,
    members_count INT DEFAULT 1,
    events_count INT DEFAULT 0,
    parent_id INT REFERENCES chapters(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'approved' CHECK (status IN ('approved', 'pending_review', 'rejected')),
    created_by_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. CHAPTER MEMBERSHIPS
CREATE TABLE IF NOT EXISTS chapter_memberships (
    id SERIAL PRIMARY KEY,
    chapter_id INT REFERENCES chapters(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chapter_id, user_id)
);

-- 5. STORIES & NEWS FEED
CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    emoji VARCHAR(20) DEFAULT '🌟',
    category VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    excerpt TEXT NOT NULL,
    content TEXT,
    author_id INT REFERENCES users(id) ON DELETE CASCADE,
    author_name VARCHAR(150) NOT NULL,
    status VARCHAR(50) DEFAULT 'published' CHECK (status IN ('published', 'pending_review', 'rejected')),
    published_date VARCHAR(50) DEFAULT TO_CHAR(CURRENT_DATE, 'DD Mon YYYY'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. JOBS
CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    emoji VARCHAR(20) DEFAULT '💻',
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    salary VARCHAR(100),
    type VARCHAR(50) DEFAULT 'fulltime',
    location VARCHAR(150),
    posted_by_id INT REFERENCES users(id) ON DELETE CASCADE,
    posted_by_name VARCHAR(150),
    batch INT,
    tags TEXT[],
    days_ago INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. EVENTS
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    emoji VARCHAR(20) DEFAULT '🎓',
    title VARCHAR(255) NOT NULL,
    event_date VARCHAR(100) NOT NULL,
    event_time VARCHAR(50),
    venue VARCHAR(255) NOT NULL,
    capacity INT DEFAULT 500,
    registered_count INT DEFAULT 0,
    price VARCHAR(50) DEFAULT 'Free',
    status VARCHAR(50) DEFAULT 'upcoming',
    type VARCHAR(100) DEFAULT 'Gala',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. CAMPAIGNS & DONATIONS
CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tag VARCHAR(100) DEFAULT 'scholarship',
    raised_amount NUMERIC(12, 2) DEFAULT 0,
    goal_amount NUMERIC(12, 2) DEFAULT 1000000,
    donors_count INT DEFAULT 0,
    days_left INT DEFAULT 30,
    gateways TEXT[] DEFAULT ARRAY['bkash', 'nagad', 'card'],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. NOTIFICATIONS & ROLE BROADCASTS
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    target_role VARCHAR(50),
    icon VARCHAR(20) DEFAULT '🔔',
    title VARCHAR(255) NOT NULL,
    subtitle TEXT,
    is_unread BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. DYNAMIC CUSTOM FIELDS
CREATE TABLE IF NOT EXISTS custom_fields (
    id VARCHAR(100) PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    section VARCHAR(50) NOT NULL,
    field_type VARCHAR(50) NOT NULL,
    is_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. IMPORT AUDIT HISTORY
CREATE TABLE IF NOT EXISTS import_history (
    id SERIAL PRIMARY KEY,
    batch_code VARCHAR(100) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    total_records INT DEFAULT 0,
    success_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    duplicate_count INT DEFAULT 0,
    admin_name VARCHAR(150) NOT NULL,
    processing_time VARCHAR(50) DEFAULT '1.0s',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. IMMUTABLE SECURITY AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    icon VARCHAR(20) DEFAULT '🛡',
    bg_color VARCHAR(50) DEFAULT 'rgba(0,168,89,0.15)',
    action VARCHAR(255) NOT NULL,
    meta TEXT NOT NULL,
    hash VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_alumni_batch ON alumni_profiles(batch);
CREATE INDEX IF NOT EXISTS idx_alumni_dept ON alumni_profiles(department);
CREATE INDEX IF NOT EXISTS idx_alumni_student_id ON alumni_profiles(student_id);
CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(status);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_unread);
