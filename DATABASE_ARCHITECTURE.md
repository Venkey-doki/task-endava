# Database Design Documentation
## ReachInbox Email Scheduler System - Complete Database Architecture

---

## 📚 Table of Contents

1. [System Overview](#system-overview)
2. [Database Architecture Philosophy](#database-architecture-philosophy)
3. [Complete Entity Relationship Model](#complete-entity-relationship-model)
4. [Table-by-Table Deep Dive](#table-by-table-deep-dive)
5. [Relationship Matrix](#relationship-matrix)
6. [Data Flow Patterns](#data-flow-patterns)
7. [Indexing Strategy](#indexing-strategy)
8. [Constraints and Data Integrity](#constraints-and-data-integrity)
9. [Scalability Considerations](#scalability-considerations)
10. [Backend Development Guidelines](#backend-development-guidelines)

---

## System Overview

### Purpose
This database powers a **production-grade email scheduling and delivery system** that:
- Schedules emails to be sent at specific times
- Enforces rate limiting to prevent spam
- Tracks delivery status and retries failures
- Maintains complete audit trails
- Survives server restarts without data loss
- Supports multiple concurrent users

### Core Requirements Met
1. ✅ **Persistence** - All scheduling data stored in PostgreSQL (not just Redis)
2. ✅ **Idempotency** - Prevent duplicate email sends
3. ✅ **Rate Limiting** - Per-user hourly email limits
4. ✅ **Audit Trail** - Complete logging of all operations
5. ✅ **Failure Handling** - Retry logic with attempt tracking
6. ✅ **Scalability** - Indexed for performance, ready for horizontal scaling
7. ✅ **Multi-tenancy** - User isolation and per-user configurations

---

## Database Architecture Philosophy

### Design Principles

#### 1. **Separation of Concerns**
Each table has a single, well-defined responsibility:
- **users** → Authentication and user identity
- **email_campaigns** → Campaign-level configuration and aggregates
- **scheduled_emails** → Individual email tracking and scheduling
- **rate_limit_tracking** → Rate limiting enforcement
- **email_send_logs** → Audit trail and debugging
- **smtp_configurations** → Sender configuration
- **job_queue_metadata** → BullMQ job synchronization
- **system_config** → Global system settings

#### 2. **Normalized for Integrity, Denormalized for Performance**
- **Normalized:** User data, SMTP configs (reduce redundancy)
- **Denormalized:** Campaign counters, rate limit data (optimize reads)
- **Hybrid Approach:** Balance data integrity with query performance

#### 3. **Event Sourcing for Critical Operations**
- `email_send_logs` captures every send attempt (event log)
- `scheduled_emails` represents current state
- This allows reconstruction of history and debugging

#### 4. **Optimistic Concurrency**
- Use database transactions for atomic operations
- Row-level locking for rate limit checks
- Unique constraints prevent race conditions

#### 5. **Future-Proof Design**
- UUID primary keys (supports distributed systems)
- Soft deletes possible (status fields)
- Extensible JSON fields could be added
- Partition-ready timestamp columns

---

## Complete Entity Relationship Model

### Visual ER Diagram (Text Format)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CORE ENTITIES                                │
└─────────────────────────────────────────────────────────────────────┘

                            ┌──────────────┐
                            │    USERS     │
                            │ (Identity)   │
                            └──────┬───────┘
                                   │
                 ┌─────────────────┼─────────────────────────┐
                 │                 │                         │
                 │                 │                         │
         ┌───────▼────────┐ ┌─────▼──────┐    ┌───────────▼──────────┐
         │ EMAIL_CAMPAIGNS│ │ SMTP_CONFIGS│    │ RATE_LIMIT_TRACKING │
         │ (Batch Config) │ │ (Senders)   │    │ (Throttling)        │
         └───────┬────────┘ └─────────────┘    └─────────────────────┘
                 │
                 │ 1:N
                 │
         ┌───────▼────────────────┐
         │  SCHEDULED_EMAILS      │
         │  (Individual Emails)   │
         └───────┬────────────────┘
                 │
         ┌───────┼────────┐
         │       │        │
    ┌────▼────┐  │  ┌─────▼──────────────┐
    │ EMAIL_  │  │  │ JOB_QUEUE_         │
    │ SEND_   │  │  │ METADATA           │
    │ LOGS    │  │  │ (BullMQ Sync)      │
    └─────────┘  │  └────────────────────┘
                 │
                 │ (Properties)
                 │ - scheduled_time
                 │ - sent_at
                 │ - status
                 │ - attempts
                 │ - idempotency_key


┌──────────────┐
│ SYSTEM_CONFIG│  (Global Settings - Standalone)
└──────────────┘
```

### Cardinality Reference

| Relationship | Type | Description |
|-------------|------|-------------|
| User → EmailCampaign | 1:N | One user creates many campaigns |
| User → ScheduledEmail | 1:N | One user schedules many emails |
| User → SmtpConfiguration | 1:N | One user can have multiple SMTP senders |
| User → RateLimitTracking | 1:N | One user has multiple hourly rate limits (one per hour) |
| EmailCampaign → ScheduledEmail | 1:N | One campaign contains many individual emails |
| ScheduledEmail → EmailSendLog | 1:N | One email can have multiple send attempts |
| ScheduledEmail → JobQueueMetadata | 1:1 | One email maps to one BullMQ job |

---

## Table-by-Table Deep Dive

### 1. **users**

#### Purpose
**Single Source of Truth for User Identity**

Stores authenticated users who access the system via Google OAuth. This is the anchor table for all user-related data.

#### Schema
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);
```

#### Field Explanations

| Field | Type | Purpose | Notes |
|-------|------|---------|-------|
| `id` | UUID | Primary key, internal reference | Generated by database, used in foreign keys |
| `google_id` | VARCHAR(255) | Google's unique identifier | From OAuth response, guaranteed unique |
| `email` | VARCHAR(255) | User's email address | Also unique, used for login |
| `name` | VARCHAR(255) | Display name | From Google profile |
| `avatar_url` | TEXT | Profile picture URL | From Google, nullable |
| `created_at` | TIMESTAMP | Account creation time | Auto-set on insert |
| `updated_at` | TIMESTAMP | Last profile update | Auto-updated by trigger |
| `last_login_at` | TIMESTAMP | Last login timestamp | Manually set on login |

#### Relationships
- **Owns:** email_campaigns, scheduled_emails, smtp_configurations, rate_limit_tracking
- **Referenced By:** All tables with `user_id` foreign key

#### Use Cases
1. **Authentication:** Validate Google OAuth login
2. **User Dashboard:** Display user's campaigns and emails
3. **Audit Trail:** Track which user performed actions
4. **Rate Limiting:** Enforce per-user email limits

#### Critical Indexes
```sql
CREATE INDEX idx_users_google_id ON users(google_id);  -- Login lookup
CREATE INDEX idx_users_email ON users(email);          -- Email search
```

#### Why UUID Instead of SERIAL?
- **Distributed Systems:** IDs can be generated client-side
- **Merging:** No ID conflicts when merging databases
- **Security:** Non-sequential IDs prevent enumeration attacks
- **Scalability:** No single point of failure for ID generation

---

### 2. **email_campaigns**

#### Purpose
**Campaign-Level Configuration and Aggregation**

Represents a batch of emails scheduled together. Acts as a container for related emails with shared configuration (subject, body, timing, rate limits).

#### Schema
```sql
CREATE TABLE email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    
    -- Scheduling configuration
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    delay_between_emails_seconds INTEGER NOT NULL DEFAULT 5,
    hourly_limit INTEGER NOT NULL DEFAULT 100,
    
    -- Metadata counters
    total_recipients INTEGER NOT NULL DEFAULT 0,
    emails_sent INTEGER NOT NULL DEFAULT 0,
    emails_failed INTEGER NOT NULL DEFAULT 0,
    emails_pending INTEGER NOT NULL DEFAULT 0,
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);
```

#### Field Explanations

| Field | Type | Purpose | Business Logic |
|-------|------|---------|----------------|
| `user_id` | UUID FK | Campaign owner | CASCADE delete: remove campaigns when user deleted |
| `name` | VARCHAR(255) | Campaign identifier | Optional, for user reference |
| `subject` | VARCHAR(500) | Email subject line | Applied to all emails in campaign |
| `body` | TEXT | Email HTML/text content | Applied to all emails in campaign |
| `start_time` | TIMESTAMP | When campaign begins | First email scheduled at this time |
| `delay_between_emails_seconds` | INTEGER | Throttle delay | Seconds between consecutive emails |
| `hourly_limit` | INTEGER | Max emails per hour | Rate limiting for this campaign |
| `total_recipients` | INTEGER | Total email count | Set when campaign created |
| `emails_sent` | INTEGER | Successfully delivered | Incremented atomically on send |
| `emails_failed` | INTEGER | Permanently failed | Incremented after max retries |
| `emails_pending` | INTEGER | Not yet sent | Decremented as emails process |
| `status` | VARCHAR(50) | Campaign lifecycle | pending→active→completed/cancelled |
| `completed_at` | TIMESTAMP | Completion time | Set when all emails processed |

#### Status Values
- `pending` - Created, not yet started
- `active` - Currently sending emails
- `paused` - User paused the campaign
- `completed` - All emails processed
- `cancelled` - User cancelled the campaign

#### Denormalized Counters Pattern
**Why store counts instead of calculating?**

```sql
-- ❌ Slow: Calculate every time
SELECT COUNT(*) FROM scheduled_emails 
WHERE campaign_id = ? AND status = 'sent';

-- ✅ Fast: Read from counter
SELECT emails_sent FROM email_campaigns WHERE id = ?;
```

**How to keep them synchronized:**
```sql
-- Use transactions
BEGIN;
UPDATE scheduled_emails SET status = 'sent' WHERE id = ?;
UPDATE email_campaigns SET emails_sent = emails_sent + 1 WHERE id = ?;
COMMIT;
```

#### Relationships
- **Belongs To:** users (via user_id)
- **Has Many:** scheduled_emails
- **Has Many:** email_send_logs (indirect, via scheduled_emails)

#### Use Cases
1. **Campaign Creation:** Store configuration and recipients
2. **Progress Tracking:** Monitor send rate and completion
3. **Dashboard Display:** Show campaign summary statistics
4. **Rate Limiting:** Apply campaign-specific hourly limits

#### Critical Indexes
```sql
CREATE INDEX idx_campaigns_user_id ON email_campaigns(user_id);
CREATE INDEX idx_campaigns_status ON email_campaigns(status);
CREATE INDEX idx_campaigns_start_time ON email_campaigns(start_time);
CREATE INDEX idx_campaigns_created_at ON email_campaigns(created_at DESC);
```

---

### 3. **scheduled_emails**

#### Purpose
**Individual Email Tracking and State Management**

The core workhorse table. Each row represents one email to be sent, with complete lifecycle tracking from scheduling through delivery or failure.

#### Schema
```sql
CREATE TABLE scheduled_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Email details
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    
    -- Scheduling
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Status & tracking
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    job_id VARCHAR(255) UNIQUE,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    
    -- Error handling
    error_message TEXT,
    last_error_at TIMESTAMP WITH TIME ZONE,
    
    -- SMTP response
    smtp_message_id VARCHAR(255),
    smtp_response TEXT,
    
    -- Idempotency
    idempotency_key VARCHAR(255) UNIQUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Field Explanations

| Field | Type | Purpose | Critical Details |
|-------|------|---------|-----------------|
| `campaign_id` | UUID FK | Parent campaign | CASCADE: delete emails when campaign deleted |
| `user_id` | UUID FK | Email owner | Denormalized for faster user queries |
| `recipient_email` | VARCHAR(255) | Who receives this | Validated format before insert |
| `subject` | VARCHAR(500) | Email subject | Usually copied from campaign |
| `body` | TEXT | Email content | Can be personalized per recipient |
| `scheduled_time` | TIMESTAMP | **WHEN** to send | **Core scheduling field** |
| `sent_at` | TIMESTAMP | **WHEN** actually sent | NULL until sent |
| `status` | VARCHAR(50) | Current state | **Most queried field** |
| `job_id` | VARCHAR(255) | BullMQ job identifier | Links to queue system |
| `attempts` | INTEGER | Retry count | Incremented on each failure |
| `max_attempts` | INTEGER | Retry limit | Usually 3, configurable |
| `error_message` | TEXT | Last error | For debugging |
| `last_error_at` | TIMESTAMP | When error occurred | Track failure timing |
| `smtp_message_id` | VARCHAR(255) | SMTP server's ID | For tracking in logs |
| `smtp_response` | TEXT | SMTP server response | Full response for audit |
| `idempotency_key` | VARCHAR(255) | Duplicate prevention | **UNIQUE constraint** |

#### Status Lifecycle

```
scheduled → queued → processing → sent
                 ↓
              failed (after max_attempts)
                 ↑
              retry (attempts < max_attempts)
```

**Status Values:**
- `scheduled` - Waiting for scheduled_time to arrive
- `queued` - Added to BullMQ, waiting for worker
- `processing` - Currently being sent by a worker
- `sent` - Successfully delivered
- `failed` - Permanently failed after max retries
- `cancelled` - User cancelled before sending

#### Idempotency Key Generation

**Purpose:** Prevent duplicate sends if system restarts mid-campaign

```typescript
// Generate unique key per email
const idempotencyKey = createHash('sha256')
    .update(`${campaignId}-${recipientEmail}-${scheduledTime.getTime()}`)
    .digest('hex');
```

**Database Enforcement:**
```sql
-- This will fail if duplicate
INSERT INTO scheduled_emails (idempotency_key, ...) 
VALUES ('camp_123_user@example.com_1708088400', ...);
-- Error: duplicate key value violates unique constraint
```

#### The scheduled_time Field: Critical for Persistence

**Why This Matters:**

In many queuing systems, scheduled jobs are stored ONLY in Redis (volatile). If Redis crashes or server restarts, future scheduled jobs are lost.

**Our Solution:** Store `scheduled_time` in PostgreSQL

**Restart Recovery Process:**
```sql
-- 1. Find emails that should have been sent but weren't
SELECT * FROM scheduled_emails
WHERE status IN ('scheduled', 'queued')
  AND scheduled_time <= NOW()
  AND scheduled_time >= NOW() - INTERVAL '1 hour';

-- 2. Re-create BullMQ jobs for them
-- (Done in application code)
```

#### Relationships
- **Belongs To:** email_campaigns (via campaign_id)
- **Belongs To:** users (via user_id)
- **Has Many:** email_send_logs
- **Has One:** job_queue_metadata

#### Use Cases
1. **Email Scheduling:** Store when each email should send
2. **Worker Processing:** Workers query for emails to send
3. **Status Tracking:** Monitor delivery progress
4. **Retry Logic:** Track and limit retry attempts
5. **Audit Trail:** Link to send logs for debugging
6. **Dashboard Display:** Show scheduled and sent emails

#### Critical Indexes

```sql
-- Most important indexes
CREATE INDEX idx_scheduled_emails_scheduled_time ON scheduled_emails(scheduled_time);
CREATE INDEX idx_scheduled_emails_status ON scheduled_emails(status);
CREATE INDEX idx_scheduled_emails_user_id ON scheduled_emails(user_id);
CREATE INDEX idx_scheduled_emails_campaign_id ON scheduled_emails(campaign_id);

-- Composite indexes for common queries
CREATE INDEX idx_scheduled_emails_user_status ON scheduled_emails(user_id, status);
CREATE INDEX idx_scheduled_emails_campaign_status ON scheduled_emails(campaign_id, status);

-- Unique constraints
CREATE UNIQUE INDEX ON scheduled_emails(job_id);
CREATE UNIQUE INDEX ON scheduled_emails(idempotency_key);
```

#### Query Patterns

**Get emails ready to send (worker query):**
```sql
SELECT * FROM scheduled_emails
WHERE status = 'scheduled'
  AND scheduled_time <= NOW() + INTERVAL '5 minutes'
  AND scheduled_time > NOW()
ORDER BY scheduled_time ASC
LIMIT 100;
```
*Uses: idx_scheduled_emails_status + idx_scheduled_emails_scheduled_time*

**Get user's sent emails (dashboard):**
```sql
SELECT * FROM scheduled_emails
WHERE user_id = ?
  AND status = 'sent'
ORDER BY sent_at DESC
LIMIT 50;
```
*Uses: idx_scheduled_emails_user_status*

**Get campaign progress:**
```sql
SELECT status, COUNT(*) as count
FROM scheduled_emails
WHERE campaign_id = ?
GROUP BY status;
```
*Uses: idx_scheduled_emails_campaign_id*

---

### 4. **rate_limit_tracking**

#### Purpose
**Atomic Rate Limiting Enforcement**

Tracks how many emails each user has sent in each hour window. Critical for preventing spam and respecting SMTP provider limits.

#### Schema
```sql
CREATE TABLE rate_limit_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hour_window TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Counters
    emails_sent INTEGER NOT NULL DEFAULT 0,
    emails_scheduled INTEGER NOT NULL DEFAULT 0,
    
    -- Limits (denormalized for quick access)
    hourly_limit INTEGER NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, hour_window)
);
```

#### Field Explanations

| Field | Type | Purpose | Critical Details |
|-------|------|---------|-----------------|
| `user_id` | UUID FK | Rate limit scope | Per-user limits |
| `hour_window` | TIMESTAMP | Hour being tracked | Truncated to hour (e.g., 2025-02-16 14:00:00) |
| `emails_sent` | INTEGER | Emails sent in this hour | Incremented atomically |
| `emails_scheduled` | INTEGER | Emails scheduled (may exceed limit) | Total attempted |
| `hourly_limit` | INTEGER | Max allowed per hour | From campaign or config |

#### Hour Window Concept

**What is `hour_window`?**

Instead of tracking "in the last 60 minutes" (sliding window), we use fixed hourly buckets:
- Hour 14:00:00 - 14:59:59
- Hour 15:00:00 - 15:59:59
- Hour 16:00:00 - 16:59:59

**Calculation:**
```sql
-- PostgreSQL
hour_window = DATE_TRUNC('hour', NOW())

-- Example:
-- If NOW() = 2025-02-16 14:37:23
-- Then hour_window = 2025-02-16 14:00:00
```

**Why Fixed Windows?**
- Simpler to implement (one row per hour)
- Easier to cleanup old data (DELETE WHERE hour_window < threshold)
- Predictable behavior (resets at top of hour)
- Database-friendly (fewer rows)

#### Unique Constraint: Race Condition Prevention

```sql
UNIQUE(user_id, hour_window)
```

**Why This Matters:**

Prevents duplicate rows for the same user in the same hour, even with concurrent requests.

**Example Race Condition (Without Constraint):**
```
Thread A: INSERT INTO rate_limit_tracking (user_id, hour_window, ...) VALUES (...);
Thread B: INSERT INTO rate_limit_tracking (user_id, hour_window, ...) VALUES (...);
-- Result: TWO rows for same user/hour → broken counting
```

**With Constraint:**
```
Thread A: INSERT ... ON CONFLICT (user_id, hour_window) DO UPDATE ...
Thread B: INSERT ... ON CONFLICT (user_id, hour_window) DO UPDATE ...
-- Result: ONE row, both threads update it atomically
```

#### Atomic Increment Pattern

**Problem:** Multiple workers sending emails concurrently

**Solution:** Use PostgreSQL's atomic operations

```sql
-- ❌ WRONG: Race condition
-- Step 1: Read current value
SELECT emails_sent FROM rate_limit_tracking WHERE user_id = ? AND hour_window = ?;
-- Step 2: Increment in application
newValue = oldValue + 1;
-- Step 3: Write back
UPDATE rate_limit_tracking SET emails_sent = ? WHERE ...;
-- ^ Another thread could update between steps 1 and 3!

-- ✅ RIGHT: Atomic increment
UPDATE rate_limit_tracking
SET emails_sent = emails_sent + 1
WHERE user_id = ? AND hour_window = ?;
-- Database guarantees atomicity
```

#### Rate Limit Check-and-Increment

**The Two-Phase Operation:**

```sql
-- Phase 1: Check if can send
BEGIN;

SELECT emails_sent, hourly_limit
FROM rate_limit_tracking
WHERE user_id = ? AND hour_window = ?
FOR UPDATE;  -- Lock this row

-- In application:
if (emails_sent >= hourly_limit) {
    ROLLBACK;
    return "Rate limit exceeded";
}

-- Phase 2: Increment counter
UPDATE rate_limit_tracking
SET emails_sent = emails_sent + 1
WHERE user_id = ? AND hour_window = ?;

COMMIT;
```

**Key Points:**
- `FOR UPDATE` locks the row during transaction
- Other threads wait for lock to be released
- Prevents double-spending of rate limit quota

#### Handling Rate Limit Exceeded

**What happens when limit reached?**

```typescript
async function scheduleEmail(email: ScheduledEmail) {
    const canSend = await checkRateLimit(email.user_id);
    
    if (!canSend) {
        // Option 1: Delay to next hour
        const nextHour = startOfNextHour();
        await updateScheduledTime(email.id, nextHour);
        
        // Option 2: Fail immediately
        // await markAsFailed(email.id, "Rate limit exceeded");
        
        // Option 3: Add to overflow queue
        // await addToOverflowQueue(email.id);
    }
}
```

**We use Option 1:** Automatically reschedule to next available hour window

#### Relationships
- **Belongs To:** users (via user_id)

#### Use Cases
1. **Rate Limit Enforcement:** Check before sending emails
2. **Capacity Planning:** Monitor system utilization
3. **User Quotas:** Track per-user consumption
4. **Analytics:** Analyze sending patterns over time

#### Critical Indexes
```sql
CREATE INDEX idx_rate_limit_user_window ON rate_limit_tracking(user_id, hour_window);
CREATE INDEX idx_rate_limit_hour_window ON rate_limit_tracking(hour_window);
```

#### Cleanup Strategy

**Problem:** This table grows infinitely (one row per user per hour)

**Solution:** Scheduled cleanup job

```sql
-- Run daily: Delete records older than 7 days
DELETE FROM rate_limit_tracking
WHERE hour_window < NOW() - INTERVAL '7 days';

-- Or archive instead of delete
INSERT INTO rate_limit_tracking_archive
SELECT * FROM rate_limit_tracking
WHERE hour_window < NOW() - INTERVAL '30 days';

DELETE FROM rate_limit_tracking
WHERE hour_window < NOW() - INTERVAL '30 days';
```

---

### 5. **email_send_logs**

#### Purpose
**Complete Audit Trail and Debugging History**

Event log capturing every email send attempt. Critical for debugging, compliance, and analytics.

#### Schema
```sql
CREATE TABLE email_send_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheduled_email_id UUID NOT NULL REFERENCES scheduled_emails(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Attempt details
    attempt_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,  -- 'success', 'failed', 'retrying'
    
    -- SMTP details
    smtp_host VARCHAR(255),
    smtp_port INTEGER,
    smtp_response_code INTEGER,
    smtp_response_message TEXT,
    
    -- Error details
    error_type VARCHAR(100),
    error_message TEXT,
    error_stack TEXT,
    
    -- Timing
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_ended_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Field Explanations

| Field | Type | Purpose | Why Important |
|-------|------|---------|---------------|
| `scheduled_email_id` | UUID FK | Which email | Links back to scheduled_emails |
| `campaign_id` | UUID FK | Campaign context | SET NULL: keep logs even if campaign deleted |
| `user_id` | UUID FK | Who sent it | For user-specific log queries |
| `attempt_number` | INTEGER | Which retry | 1 = first attempt, 2 = first retry, etc. |
| `status` | VARCHAR(50) | Attempt outcome | success / failed / retrying |
| `smtp_host` | VARCHAR(255) | Which SMTP server | For multi-server setups |
| `smtp_port` | INTEGER | Which port | 587 (TLS) or 465 (SSL) |
| `smtp_response_code` | INTEGER | SMTP status code | 250=success, 550=error, etc. |
| `smtp_response_message` | TEXT | Full SMTP response | Original server message |
| `error_type` | VARCHAR(100) | Error category | CONNECTION_TIMEOUT, INVALID_EMAIL, etc. |
| `error_message` | TEXT | Human-readable error | For display to users |
| `error_stack` | TEXT | Stack trace | For developer debugging |
| `processing_started_at` | TIMESTAMP | When send began | Calculate processing time |
| `processing_ended_at` | TIMESTAMP | When send completed | Calculate processing time |
| `duration_ms` | INTEGER | How long it took | Performance monitoring |

#### Event Sourcing Pattern

**Concept:** This is an **append-only log** of events

**Contrast with `scheduled_emails`:**
- `scheduled_emails` = **Current State** (1 row per email)
- `email_send_logs` = **Event History** (multiple rows per email)

**Example:**
```
scheduled_emails:
  id: 123, status: 'failed', attempts: 3

email_send_logs:
  { id: 1, scheduled_email_id: 123, attempt_number: 1, status: 'failed', error: 'timeout' }
  { id: 2, scheduled_email_id: 123, attempt_number: 2, status: 'retrying', error: 'timeout' }
  { id: 3, scheduled_email_id: 123, attempt_number: 3, status: 'failed', error: 'timeout' }
```

**Benefits:**
- Complete history preserved
- Can replay events to debug
- Analyze patterns (e.g., "timeouts happen at 3pm daily")

#### Log Status Values

- `success` - Email sent successfully
- `failed` - Send attempt failed
- `retrying` - Failed but will retry

**Note:** `retrying` indicates the system will try again

#### SMTP Response Code Reference

Common codes you'll see in logs:

| Code | Meaning | Action |
|------|---------|--------|
| 250 | Success | Email accepted |
| 421 | Service not available | Retry later |
| 450 | Mailbox unavailable | Retry later |
| 451 | Aborted | Retry later |
| 550 | Mailbox not found | Don't retry |
| 551 | User not local | Don't retry |
| 552 | Storage exceeded | Don't retry |
| 553 | Mailbox name invalid | Don't retry |
| 554 | Transaction failed | Usually don't retry |

**Implementation:**
```typescript
function shouldRetry(smtpCode: number): boolean {
    // 4xx = temporary errors (retry)
    // 5xx = permanent errors (don't retry)
    return smtpCode >= 400 && smtpCode < 500;
}
```

#### Relationships
- **Belongs To:** scheduled_emails (via scheduled_email_id)
- **Belongs To:** email_campaigns (via campaign_id, nullable)
- **Belongs To:** users (via user_id)

#### Use Cases
1. **Debugging:** "Why did email X fail?"
2. **Analytics:** "What's our average send time?"
3. **Compliance:** "Prove we attempted delivery"
4. **Pattern Detection:** "Are timeouts correlated with time of day?"
5. **Performance Monitoring:** Track duration_ms trends

#### Critical Indexes
```sql
CREATE INDEX idx_email_logs_scheduled_email ON email_send_logs(scheduled_email_id);
CREATE INDEX idx_email_logs_campaign ON email_send_logs(campaign_id);
CREATE INDEX idx_email_logs_user ON email_send_logs(user_id);
CREATE INDEX idx_email_logs_status ON email_send_logs(status);
CREATE INDEX idx_email_logs_created_at ON email_send_logs(created_at DESC);
```

#### Query Examples

**Get all attempts for one email:**
```sql
SELECT 
    attempt_number,
    status,
    smtp_response_code,
    error_message,
    duration_ms,
    created_at
FROM email_send_logs
WHERE scheduled_email_id = ?
ORDER BY attempt_number;
```

**Average send time by hour:**
```sql
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    AVG(duration_ms) as avg_duration,
    COUNT(*) as sends
FROM email_send_logs
WHERE status = 'success'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour;
```

**Most common errors:**
```sql
SELECT 
    error_type,
    COUNT(*) as occurrences,
    AVG(attempt_number) as avg_attempt_when_occurred
FROM email_send_logs
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY error_type
ORDER BY occurrences DESC
LIMIT 10;
```

#### Data Retention

**Problem:** Logs grow large over time

**Strategies:**

1. **Archive old logs:**
```sql
-- Move to archive table
INSERT INTO email_send_logs_archive
SELECT * FROM email_send_logs
WHERE created_at < NOW() - INTERVAL '90 days';

DELETE FROM email_send_logs
WHERE created_at < NOW() - INTERVAL '90 days';
```

2. **Partition by time:**
```sql
-- PostgreSQL 10+
CREATE TABLE email_send_logs_2025_02 PARTITION OF email_send_logs
FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
```

3. **Aggregate and summarize:**
```sql
-- Keep summary stats, delete raw logs
INSERT INTO email_send_stats_daily
SELECT 
    DATE(created_at),
    user_id,
    status,
    COUNT(*),
    AVG(duration_ms)
FROM email_send_logs
WHERE DATE(created_at) = CURRENT_DATE - 1
GROUP BY DATE(created_at), user_id, status;
```

---

### 6. **smtp_configurations**

#### Purpose
**SMTP Sender Configuration Management**

Stores SMTP server credentials and settings for sending emails. Supports multiple senders per user (e.g., different brands, departments, or accounts).

#### Schema
```sql
CREATE TABLE smtp_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- SMTP details
    name VARCHAR(255) NOT NULL,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_secure BOOLEAN NOT NULL DEFAULT false,
    smtp_username VARCHAR(255) NOT NULL,
    smtp_password_encrypted TEXT NOT NULL,
    
    -- Sender info
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    
    -- Rate limiting per sender
    hourly_limit INTEGER DEFAULT 100,
    daily_limit INTEGER DEFAULT 1000,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE
);
```

#### Field Explanations

| Field | Type | Purpose | Security/Usage Notes |
|-------|------|---------|---------------------|
| `name` | VARCHAR(255) | User-friendly label | E.g., "Marketing SMTP", "Sales Team" |
| `smtp_host` | VARCHAR(255) | SMTP server address | smtp.gmail.com, smtp.sendgrid.net, etc. |
| `smtp_port` | INTEGER | Connection port | 587 (STARTTLS), 465 (SSL/TLS), 25 (plain) |
| `smtp_secure` | BOOLEAN | Use SSL/TLS | true = implicit TLS, false = STARTTLS |
| `smtp_username` | VARCHAR(255) | SMTP auth username | Often same as email |
| `smtp_password_encrypted` | TEXT | **Encrypted password** | **NEVER store plaintext** |
| `from_email` | VARCHAR(255) | Sender email address | Must be authorized by SMTP server |
| `from_name` | VARCHAR(255) | Display name | "John from Marketing" |
| `is_active` | BOOLEAN | Currently in use | Soft delete alternative |
| `is_verified` | BOOLEAN | Credentials tested | Send test email to verify |
| `hourly_limit` | INTEGER | Per-sender rate limit | Provider-specific |
| `daily_limit` | INTEGER | Daily sending quota | Provider-specific |
| `last_used_at` | TIMESTAMP | Last send time | Track usage |

#### Password Encryption

**CRITICAL:** Never store passwords in plaintext!

**Encryption Implementation:**
```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 bytes
const IV_LENGTH = 16;

function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}
```

**Storage:**
```typescript
// When saving
const encryptedPassword = encrypt(plainPassword);
await db.smtp_configurations.create({
    smtp_password_encrypted: encryptedPassword,
    // ... other fields
});

// When using
const config = await db.smtp_configurations.findOne({ id });
const plainPassword = decrypt(config.smtp_password_encrypted);
// Use for SMTP connection
```

**Environment Variable:**
```bash
# .env
ENCRYPTION_KEY=your-32-byte-secret-key-here-1234
```

#### Multi-Sender Support

**Why multiple SMTP configs per user?**

1. **Different Brands:** Marketing@brand1.com, Sales@brand2.com
2. **Rate Limit Spreading:** Split across multiple providers
3. **Failover:** If one SMTP fails, use backup
4. **Testing:** Separate test and production configs

**Selection Strategy:**
```typescript
async function selectSmtpConfig(userId: string): Promise<SmtpConfiguration> {
    // Strategy 1: Round-robin
    const configs = await db.smtp_configurations.find({
        user_id: userId,
        is_active: true,
        is_verified: true
    }).orderBy('last_used_at', 'ASC');
    
    return configs[0]; // Use least recently used
    
    // Strategy 2: Load balance by daily quota
    // Strategy 3: Specific config per campaign
}
```

#### SMTP Verification

**Purpose:** Test credentials before using in production

```typescript
async function verifySmtpConfig(configId: string): Promise<boolean> {
    const config = await db.smtp_configurations.findOne({ id: configId });
    const password = decrypt(config.smtp_password_encrypted);
    
    try {
        const transporter = nodemailer.createTransport({
            host: config.smtp_host,
            port: config.smtp_port,
            secure: config.smtp_secure,
            auth: {
                user: config.smtp_username,
                pass: password
            }
        });
        
        // Verify connection
        await transporter.verify();
        
        // Send test email
        await transporter.sendMail({
            from: `"${config.from_name}" <${config.from_email}>`,
            to: config.from_email, // Send to self
            subject: 'SMTP Configuration Test',
            text: 'This is a test email to verify SMTP settings.'
        });
        
        // Mark as verified
        await db.smtp_configurations.update(configId, {
            is_verified: true,
            last_used_at: new Date()
        });
        
        return true;
    } catch (error) {
        console.error('SMTP verification failed:', error);
        return false;
    }
}
```

#### Relationships
- **Belongs To:** users (via user_id)

#### Use Cases
1. **Email Sending:** Get credentials for SMTP connection
2. **Multi-Brand:** Different sender addresses per campaign
3. **Rate Limit Management:** Per-sender quotas
4. **Failover:** Switch to backup SMTP if primary fails
5. **Testing:** Separate test credentials

#### Critical Indexes
```sql
CREATE INDEX idx_smtp_config_user_id ON smtp_configurations(user_id);
CREATE INDEX idx_smtp_config_active ON smtp_configurations(is_active);
```

---

### 7. **job_queue_metadata**

#### Purpose
**BullMQ Job Synchronization and Monitoring**

Bridges the gap between BullMQ (Redis-based queue) and PostgreSQL database. Provides a persistent record of queue jobs.

#### Schema
```sql
CREATE TABLE job_queue_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(255) UNIQUE NOT NULL,
    scheduled_email_id UUID REFERENCES scheduled_emails(id) ON DELETE CASCADE,
    
    -- Queue info
    queue_name VARCHAR(100) NOT NULL DEFAULT 'email-queue',
    job_type VARCHAR(50) NOT NULL DEFAULT 'send-email',
    
    -- Scheduling
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'waiting',
    attempts INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Field Explanations

| Field | Type | Purpose | BullMQ Mapping |
|-------|------|---------|----------------|
| `job_id` | VARCHAR(255) | BullMQ job identifier | `job.id` from BullMQ |
| `scheduled_email_id` | UUID FK | Links to email | Our domain object |
| `queue_name` | VARCHAR(100) | Which queue | BullMQ queue name |
| `job_type` | VARCHAR(50) | Job category | For multiple job types |
| `scheduled_for` | TIMESTAMP | When job should run | `job.opts.delay` |
| `processed_at` | TIMESTAMP | When job completed | `job.finishedOn` |
| `status` | VARCHAR(50) | Job state | `job.getState()` |
| `attempts` | INTEGER | Retry count | `job.attemptsMade` |

#### Why This Table Exists

**Problem:** BullMQ stores jobs in Redis, which is volatile

**Scenarios:**
1. Redis crashes → All queued jobs lost
2. Need to query "jobs scheduled for tomorrow" → Can't query Redis efficiently
3. Want historical data → Redis is not a database

**Solution:** Sync job metadata to PostgreSQL

**Benefits:**
- **Persistent Records:** Jobs tracked even if Redis fails
- **SQL Queries:** Easy reporting and monitoring
- **Job Recovery:** Reconstruct jobs after Redis failure
- **Audit Trail:** Historical job execution data

#### Job Status Values

Map BullMQ states to our database:

| DB Status | BullMQ State | Meaning |
|-----------|--------------|---------|
| `waiting` | waiting | In queue, not yet processed |
| `active` | active | Currently being processed |
| `completed` | completed | Successfully finished |
| `failed` | failed | Failed (may retry) |
| `delayed` | delayed | Scheduled for future |

#### BullMQ Integration Pattern

**Creating a job:**
```typescript
async function scheduleEmailJob(scheduledEmail: ScheduledEmail) {
    // 1. Calculate delay
    const delay = scheduledEmail.scheduled_time.getTime() - Date.now();
    
    // 2. Create BullMQ job
    const job = await emailQueue.add(
        'send-email',
        { scheduledEmailId: scheduledEmail.id },
        {
            jobId: `email-${scheduledEmail.id}`,
            delay: delay > 0 ? delay : 0,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 }
        }
    );
    
    // 3. Record in database
    await db.job_queue_metadata.create({
        job_id: job.id,
        scheduled_email_id: scheduledEmail.id,
        queue_name: 'email-queue',
        job_type: 'send-email',
        scheduled_for: scheduledEmail.scheduled_time,
        status: 'waiting',
        attempts: 0
    });
    
    // 4. Update scheduled_emails with job_id
    await db.scheduled_emails.update(scheduledEmail.id, {
        job_id: job.id,
        status: 'queued'
    });
}
```

**Processing a job:**
```typescript
emailQueue.process('send-email', async (job) => {
    const { scheduledEmailId } = job.data;
    
    // Update status to active
    await db.job_queue_metadata.update(
        { job_id: job.id },
        { status: 'active', attempts: job.attemptsMade }
    );
    
    try {
        // Send email logic here
        const result = await sendEmail(scheduledEmailId);
        
        // Mark as completed
        await db.job_queue_metadata.update(
            { job_id: job.id },
            { status: 'completed', processed_at: new Date() }
        );
        
        return result;
    } catch (error) {
        // Mark as failed
        await db.job_queue_metadata.update(
            { job_id: job.id },
            { status: 'failed', attempts: job.attemptsMade }
        );
        
        throw error; // Let BullMQ handle retry
    }
});
```

#### Job Recovery After Restart

**Scenario:** Server crashes, BullMQ jobs lost in Redis

**Recovery Process:**
```typescript
async function recoverLostJobs() {
    // Find emails that should be queued but have no active job
    const lostEmails = await db.scheduled_emails.find({
        status: 'queued',
        scheduled_time: { gte: new Date() }, // Future emails
        job_id: { not: null }
    });
    
    for (const email of lostEmails) {
        // Check if job still exists in BullMQ
        const job = await emailQueue.getJob(email.job_id);
        
        if (!job) {
            // Job lost! Recreate it
            console.log(`Recovering job for email ${email.id}`);
            await scheduleEmailJob(email);
        }
    }
}

// Run on server startup
recoverLostJobs();
```

#### Relationships
- **Belongs To:** scheduled_emails (via scheduled_email_id)

#### Use Cases
1. **Job Monitoring:** Track queue status
2. **Debugging:** "Why didn't job X run?"
3. **Recovery:** Recreate jobs after Redis failure
4. **Analytics:** Job processing times
5. **Alerting:** Detect stuck jobs

#### Critical Indexes
```sql
CREATE INDEX idx_job_metadata_job_id ON job_queue_metadata(job_id);
CREATE INDEX idx_job_metadata_scheduled_email ON job_queue_metadata(scheduled_email_id);
CREATE INDEX idx_job_metadata_status ON job_queue_metadata(status);
CREATE INDEX idx_job_metadata_scheduled_for ON job_queue_metadata(scheduled_for);
```

#### Monitoring Queries

**Stuck jobs (processing too long):**
```sql
SELECT * FROM job_queue_metadata
WHERE status = 'active'
  AND updated_at < NOW() - INTERVAL '5 minutes';
```

**Jobs scheduled for next hour:**
```sql
SELECT * FROM job_queue_metadata
WHERE status IN ('waiting', 'delayed')
  AND scheduled_for BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
ORDER BY scheduled_for;
```

**Failure rate:**
```sql
SELECT 
    DATE(created_at) as date,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
    ROUND(COUNT(CASE WHEN status = 'failed' THEN 1 END)::DECIMAL / COUNT(*) * 100, 2) as failure_rate_pct
FROM job_queue_metadata
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

### 8. **system_config**

#### Purpose
**Global System Configuration Management**

Stores system-wide settings that affect all users and operations. Allows runtime configuration changes without code deployment.

#### Schema
```sql
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    description TEXT,
    data_type VARCHAR(50) NOT NULL DEFAULT 'string',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Field Explanations

| Field | Type | Purpose | Example |
|-------|------|---------|---------|
| `config_key` | VARCHAR(100) | Setting identifier | 'global_hourly_limit' |
| `config_value` | TEXT | Setting value (as string) | '200' |
| `description` | TEXT | Human-readable explanation | 'Maximum emails per hour system-wide' |
| `data_type` | VARCHAR(50) | How to parse value | 'number', 'string', 'boolean', 'json' |

#### Default Configuration

```sql
INSERT INTO system_config (config_key, config_value, description, data_type) VALUES
('global_hourly_limit', '200', 'Maximum emails per hour across all users', 'number'),
('default_delay_between_emails', '5', 'Default delay between emails in seconds', 'number'),
('max_retry_attempts', '3', 'Maximum retry attempts for failed emails', 'number'),
('worker_concurrency', '5', 'Number of concurrent BullMQ workers', 'number'),
('email_batch_size', '100', 'Number of emails to process in a batch', 'number'),
('smtp_timeout_seconds', '30', 'SMTP connection timeout', 'number'),
('enable_rate_limiting', 'true', 'Enable or disable rate limiting globally', 'boolean'),
('maintenance_mode', 'false', 'System maintenance mode', 'boolean');
```

#### Type-Safe Access

**Problem:** Values stored as TEXT need type conversion

**Solution:** Typed getter functions

```typescript
class SystemConfig {
    async get(key: string): Promise<string | null> {
        const config = await db.system_config.findOne({ config_key: key });
        return config?.config_value || null;
    }
    
    async getNumber(key: string): Promise<number | null> {
        const value = await this.get(key);
        return value ? parseInt(value, 10) : null;
    }
    
    async getBoolean(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value === 'true';
    }
    
    async getJSON<T>(key: string): Promise<T | null> {
        const value = await this.get(key);
        return value ? JSON.parse(value) : null;
    }
    
    async set(key: string, value: any, dataType: string = 'string'): Promise<void> {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        await db.system_config.upsert({
            where: { config_key: key },
            update: { config_value: stringValue, data_type: dataType },
            create: { config_key: key, config_value: stringValue, data_type: dataType }
        });
    }
}

// Usage
const config = new SystemConfig();
const workerCount = await config.getNumber('worker_concurrency');
const rateLimitingEnabled = await config.getBoolean('enable_rate_limiting');
```

#### Configuration Categories

**Performance Settings:**
- `worker_concurrency` - How many emails to process simultaneously
- `email_batch_size` - Batch size for bulk operations
- `smtp_timeout_seconds` - Network timeout

**Rate Limiting:**
- `global_hourly_limit` - System-wide rate cap
- `default_delay_between_emails` - Default throttle delay
- `max_retry_attempts` - Failure retry limit

**Feature Flags:**
- `enable_rate_limiting` - Toggle rate limits
- `maintenance_mode` - Pause all operations
- `enable_webhook_notifications` - Future feature

**Business Rules:**
- `max_recipients_per_campaign` - Campaign size limit
- `max_campaigns_per_user` - User quota
- `min_delay_between_emails` - Minimum allowed delay

#### Hot Configuration Updates

**Benefit:** Change settings without restarting servers

```typescript
// Worker process
class EmailWorker {
    private config: SystemConfig;
    
    async processEmails() {
        // Read fresh config on each batch
        const concurrency = await this.config.getNumber('worker_concurrency') || 5;
        const batchSize = await this.config.getNumber('email_batch_size') || 100;
        
        // Use current settings
        await this.processBatch(batchSize, concurrency);
    }
}

// Admin API endpoint
app.post('/api/admin/config', async (req, res) => {
    const { key, value } = req.body;
    
    await systemConfig.set(key, value);
    
    res.json({ message: 'Configuration updated', key, value });
    // Workers will pick up new value on next iteration
});
```

#### Caching Strategy

**Problem:** Querying database for every config read is slow

**Solution:** Cache with TTL

```typescript
class CachedSystemConfig {
    private cache = new Map<string, { value: any; expires: number }>();
    private ttl = 60000; // 1 minute
    
    async get(key: string): Promise<string | null> {
        // Check cache
        const cached = this.cache.get(key);
        if (cached && cached.expires > Date.now()) {
            return cached.value;
        }
        
        // Fetch from DB
        const config = await db.system_config.findOne({ config_key: key });
        const value = config?.config_value || null;
        
        // Cache result
        this.cache.set(key, {
            value,
            expires: Date.now() + this.ttl
        });
        
        return value;
    }
    
    invalidate(key: string): void {
        this.cache.delete(key);
    }
    
    invalidateAll(): void {
        this.cache.clear();
    }
}
```

#### Relationships
- **Standalone:** No foreign keys (global settings)

#### Use Cases
1. **Runtime Configuration:** Change settings without deployment
2. **Feature Flags:** Enable/disable features
3. **Performance Tuning:** Adjust worker counts, timeouts
4. **Emergency Controls:** Maintenance mode, rate limit overrides
5. **A/B Testing:** Different settings for experiments

#### Critical Indexes
```sql
CREATE UNIQUE INDEX idx_system_config_key ON system_config(config_key);
```

#### Admin Interface Queries

**Get all settings:**
```sql
SELECT config_key, config_value, description, data_type
FROM system_config
ORDER BY config_key;
```

**Update setting:**
```sql
UPDATE system_config
SET config_value = ?, updated_at = NOW()
WHERE config_key = ?;
```

**Config history (with updated_at tracking):**
```sql
-- Shows when each config was last changed
SELECT config_key, config_value, updated_at
FROM system_config
ORDER BY updated_at DESC;
```

---

## Relationship Matrix

### Foreign Key Relationships

| Parent Table | Child Table | FK Column | On Delete | Purpose |
|-------------|-------------|-----------|-----------|---------|
| users | email_campaigns | user_id | CASCADE | User owns campaigns |
| users | scheduled_emails | user_id | CASCADE | User owns emails |
| users | smtp_configurations | user_id | CASCADE | User owns SMTP configs |
| users | rate_limit_tracking | user_id | CASCADE | User has rate limits |
| users | email_send_logs | user_id | CASCADE | User's audit logs |
| email_campaigns | scheduled_emails | campaign_id | CASCADE | Campaign contains emails |
| email_campaigns | email_send_logs | campaign_id | SET NULL | Logs survive campaign deletion |
| scheduled_emails | email_send_logs | scheduled_email_id | CASCADE | Email's send history |
| scheduled_emails | job_queue_metadata | scheduled_email_id | CASCADE | Email's queue job |

### Cascade Delete Implications

**When user deleted:**
```
users (deleted)
  ├── email_campaigns (CASCADE deleted)
  │     └── scheduled_emails (CASCADE deleted)
  │           ├── email_send_logs (CASCADE deleted)
  │           └── job_queue_metadata (CASCADE deleted)
  ├── smtp_configurations (CASCADE deleted)
  └── rate_limit_tracking (CASCADE deleted)
```

**When campaign deleted:**
```
email_campaigns (deleted)
  ├── scheduled_emails (CASCADE deleted)
  │     ├── email_send_logs (CASCADE deleted)
  │     └── job_queue_metadata (CASCADE deleted)
  └── email_send_logs.campaign_id (SET NULL, logs preserved)
```

### Data Denormalization Map

| Denormalized Field | Source of Truth | Sync Method |
|-------------------|----------------|-------------|
| email_campaigns.emails_sent | COUNT(scheduled_emails WHERE status='sent') | Atomic increment in transaction |
| email_campaigns.emails_failed | COUNT(scheduled_emails WHERE status='failed') | Atomic increment in transaction |
| email_campaigns.emails_pending | COUNT(scheduled_emails WHERE status IN (...)) | Atomic decrement in transaction |
| scheduled_emails.user_id | email_campaigns.user_id | Copy on insert (for faster user queries) |
| rate_limit_tracking.hourly_limit | email_campaigns.hourly_limit OR system_config | Copy on record creation |

---

## Data Flow Patterns

### Pattern 1: Creating and Scheduling a Campaign

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User submits campaign via API                            │
│    POST /api/campaigns                                       │
│    { subject, body, recipients[], start_time, ... }         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Create campaign record                                    │
│    INSERT INTO email_campaigns                               │
│    - Set total_recipients = recipients.length                │
│    - Set emails_pending = recipients.length                  │
│    - Set status = 'pending'                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Calculate scheduled times                                 │
│    For each recipient:                                       │
│      scheduled_time = start_time + (index * delay_seconds)   │
│      idempotency_key = hash(campaign_id + email + time)     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Bulk insert scheduled_emails                              │
│    INSERT INTO scheduled_emails (batch)                      │
│    - Set status = 'scheduled'                                │
│    - job_id = NULL (will be set when queued)                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Create BullMQ jobs                                        │
│    For each scheduled_email:                                 │
│      delay = scheduled_time - NOW()                          │
│      job = emailQueue.add({ emailId }, { delay })           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Update with job IDs                                       │
│    UPDATE scheduled_emails                                   │
│    SET job_id = ?, status = 'queued'                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Insert job metadata                                       │
│    INSERT INTO job_queue_metadata                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Update campaign status                                    │
│    UPDATE email_campaigns SET status = 'active'             │
└─────────────────────────────────────────────────────────────┘
```

### Pattern 2: Processing and Sending an Email

```
┌─────────────────────────────────────────────────────────────┐
│ 1. BullMQ job triggers at scheduled_time                     │
│    Worker picks up job from queue                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Fetch scheduled_email by job_id                           │
│    SELECT * FROM scheduled_emails WHERE job_id = ?          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Check rate limit                                          │
│    SELECT * FROM rate_limit_tracking                         │
│    WHERE user_id = ? AND hour_window = current_hour         │
│    FOR UPDATE  -- Lock the row                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────┴───────┐
                    │              │
         Can Send? YES            NO
                    │              │
                    ▼              ▼
    ┌───────────────────┐  ┌──────────────────┐
    │ 4a. Mark processing│  │ 4b. Reschedule   │
    │ UPDATE status =    │  │ Calculate next   │
    │ 'processing'       │  │ available hour   │
    └──────┬────────────┘  │ UPDATE scheduled_│
           │               │ time, RETURN     │
           ▼               └──────────────────┘
    ┌───────────────────┐
    │ 5. Send via SMTP  │
    │ - Get SMTP config │
    │ - Create transport│
    │ - Send email      │
    └──────┬────────────┘
           │
    ┌──────┴───────┐
    │              │
SUCCESS           FAILURE
    │              │
    ▼              ▼
┌────────────┐  ┌──────────────────┐
│6a. Success │  │6b. Handle Failure│
│UPDATE:     │  │ attempts++       │
│status=sent │  │ IF attempts <    │
│sent_at=NOW │  │ max_attempts:    │
│smtp_msg_id │  │   status=queued  │
│            │  │   retry later    │
│INCREMENT:  │  │ ELSE:            │
│campaign.   │  │   status=failed  │
│emails_sent │  │   INCREMENT      │
│            │  │   campaign.      │
│rate_limit. │  │   emails_failed  │
│emails_sent │  │                  │
│            │  │                  │
│INSERT:     │  │ INSERT:          │
│email_send_ │  │ email_send_logs  │
│logs        │  │ (failure)        │
│(success)   │  │                  │
└────────────┘  └──────────────────┘
```

### Pattern 3: Server Restart Recovery

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Server starts up                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. BullMQ reconnects to Redis                                │
│    - Existing jobs automatically recovered (if Redis alive) │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Find stuck jobs (processing too long)                     │
│    SELECT * FROM scheduled_emails                            │
│    WHERE status = 'processing'                               │
│      AND updated_at < NOW() - INTERVAL '5 minutes'          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Reset stuck jobs                                          │
│    UPDATE scheduled_emails                                   │
│    SET status = 'queued'                                     │
│    WHERE id IN (stuck_job_ids)                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Find emails missing BullMQ jobs                           │
│    SELECT * FROM scheduled_emails se                         │
│    LEFT JOIN job_queue_metadata jqm ON se.job_id = jqm.job_id│
│    WHERE se.status IN ('scheduled', 'queued')                │
│      AND se.scheduled_time > NOW()                           │
│      AND jqm.id IS NULL  -- No job in metadata              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Recreate missing BullMQ jobs                              │
│    For each missing email:                                   │
│      - Create new BullMQ job                                 │
│      - Update job_id in scheduled_emails                     │
│      - Insert job_queue_metadata                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Resume normal operations                                  │
│    - Workers start processing jobs                           │
│    - Future emails will send at correct time                 │
└─────────────────────────────────────────────────────────────┘
```

### Pattern 4: Rate Limit Enforcement Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Worker ready to send email                                   │
│ emailToSend = { id, user_id, scheduled_time, ... }          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Calculate current hour window                                │
│ hourWindow = DATE_TRUNC('hour', NOW())                      │
│ e.g., 2025-02-16 14:00:00                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ BEGIN TRANSACTION                                            │
│                                                              │
│ Get or create rate limit record (with lock):                │
│ SELECT * FROM rate_limit_tracking                           │
│ WHERE user_id = ? AND hour_window = ?                       │
│ FOR UPDATE                                                  │
│                                                              │
│ If not exists:                                              │
│   INSERT INTO rate_limit_tracking                           │
│   (user_id, hour_window, emails_sent=0, hourly_limit=?)    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Check: emails_sent < hourly_limit ?                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────┴───────┐
                    │              │
                   YES            NO
                    │              │
                    ▼              ▼
    ┌───────────────────┐  ┌──────────────────────┐
    │ Within Limit      │  │ Limit Exceeded       │
    │                   │  │                      │
    │ INCREMENT:        │  │ ROLLBACK TRANSACTION │
    │ emails_sent++     │  │                      │
    │                   │  │ Calculate next hour: │
    │ COMMIT TRANSACTION│  │ nextHour =           │
    │                   │  │ hourWindow + 1 hour  │
    │ Proceed to send   │  │                      │
    │ email (Pattern 2) │  │ UPDATE scheduled_    │
    │                   │  │ emails SET           │
    │                   │  │ scheduled_time =     │
    │                   │  │ nextHour + offset    │
    │                   │  │                      │
    │                   │  │ Reschedule BullMQ    │
    │                   │  │ job with new delay   │
    │                   │  │                      │
    │                   │  │ Log: "Rate limit hit"│
    └───────────────────┘  └──────────────────────┘
```

---

## Indexing Strategy

### Index Types Used

1. **B-Tree (Default):** Most indexes, good for equality and range queries
2. **Unique:** Enforce uniqueness (idempotency_key, job_id)
3. **Composite:** Multiple columns (user_id + status)
4. **Partial:** Index subset of rows (WHERE clause) - future optimization

### Critical Query Patterns and Their Indexes

#### 1. Worker: Get Emails Ready to Send

**Query:**
```sql
SELECT * FROM scheduled_emails
WHERE status = 'scheduled'
  AND scheduled_time <= NOW() + INTERVAL '5 minutes'
ORDER BY scheduled_time ASC
LIMIT 100;
```

**Indexes Used:**
- `idx_scheduled_emails_status` (filter by status)
- `idx_scheduled_emails_scheduled_time` (range + sort)

**Optimization:** Composite index
```sql
CREATE INDEX idx_scheduled_emails_status_time 
ON scheduled_emails(status, scheduled_time)
WHERE status IN ('scheduled', 'queued');
```

#### 2. Dashboard: User's Campaigns

**Query:**
```sql
SELECT * FROM email_campaigns
WHERE user_id = ?
ORDER BY created_at DESC;
```

**Indexes Used:**
- `idx_campaigns_user_id` (filter)
- `idx_campaigns_created_at` (sort)

**Already Optimal:** Separate indexes work well here

#### 3. Dashboard: Campaign Progress

**Query:**
```sql
SELECT status, COUNT(*) FROM scheduled_emails
WHERE campaign_id = ?
GROUP BY status;
```

**Index Used:**
- `idx_scheduled_emails_campaign_status` (covers filter + group by)

**Perfect:** Composite index covers entire query

#### 4. Rate Limit Check

**Query:**
```sql
SELECT * FROM rate_limit_tracking
WHERE user_id = ? AND hour_window = ?
FOR UPDATE;
```

**Index Used:**
- Unique index on `(user_id, hour_window)`

**Perfect:** Unique constraint serves as index

#### 5. Audit Logs: Find All Attempts for Email

**Query:**
```sql
SELECT * FROM email_send_logs
WHERE scheduled_email_id = ?
ORDER BY attempt_number;
```

**Index Used:**
- `idx_email_logs_scheduled_email`

**Good:** Foreign key index covers this

### Index Maintenance

**Monitor Index Usage:**
```sql
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as times_used,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

**Find Unused Indexes:**
```sql
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%pkey'
  AND schemaname = 'public';
```

**Analyze Query Performance:**
```sql
EXPLAIN ANALYZE
SELECT * FROM scheduled_emails
WHERE status = 'scheduled'
  AND scheduled_time <= NOW()
LIMIT 100;
```

---

## Constraints and Data Integrity

### Primary Keys

All tables use **UUID primary keys** via `gen_random_uuid()`

**Benefits:**
- Globally unique (merge databases without conflicts)
- Non-sequential (security: prevent enumeration)
- Generated at database level (consistent)

**Trade-offs:**
- Slightly larger than BIGINT (16 bytes vs 8 bytes)
- Random order (less index-friendly than sequential)

**When to use SERIAL instead:**
- High write throughput tables
- Order matters (want sequential IDs)
- Size critical (billions of rows)

### Foreign Key Constraints

**Purpose:** Referential integrity

**CASCADE DELETE patterns:**
```sql
user_id ON DELETE CASCADE
-- Reason: User owns this data, should be removed together

campaign_id ON DELETE CASCADE  
-- Reason: Emails belong to campaign, orphans are meaningless

campaign_id ON DELETE SET NULL (in email_send_logs)
-- Reason: Logs are historical, preserve even if campaign deleted
```

**Backend Implication:**
```typescript
// ✅ Safe: Database enforces integrity
await db.users.delete({ id: userId });
// Automatically cascades to campaigns, emails, logs, etc.

// ❌ Unsafe without FK constraints:
await db.users.delete({ id: userId });
// Orphaned records remain in other tables!
```

### Unique Constraints

**Critical unique constraints:**

1. **scheduled_emails.idempotency_key**
   - Prevents duplicate email sends
   - Enforced at database level (not just application)

2. **scheduled_emails.job_id**
   - One email = one job
   - Prevents job ID reuse

3. **users.google_id, users.email**
   - One user per Google account
   - One user per email address

4. **rate_limit_tracking (user_id, hour_window)**
   - One record per user per hour
   - Critical for atomic rate limiting

5. **system_config.config_key**
   - One value per setting key

**Backend Usage:**
```typescript
// Idempotency example
try {
    await db.scheduled_emails.create({
        idempotency_key: 'camp_123_user@example.com_1708088400',
        // ... other fields
    });
} catch (error) {
    if (error.code === '23505') { // Unique violation
        // Email already scheduled, skip
        console.log('Email already scheduled (idempotent)');
        return;
    }
    throw error;
}
```

### Check Constraints

**Not explicitly defined, but recommended:**

```sql
-- Ensure counters are non-negative
ALTER TABLE email_campaigns
ADD CONSTRAINT check_counters_non_negative
CHECK (
    total_recipients >= 0 AND
    emails_sent >= 0 AND
    emails_failed >= 0 AND
    emails_pending >= 0
);

-- Ensure sent_at is after scheduled_time
ALTER TABLE scheduled_emails
ADD CONSTRAINT check_sent_after_scheduled
CHECK (sent_at IS NULL OR sent_at >= scheduled_time);

-- Ensure max_attempts is positive
ALTER TABLE scheduled_emails
ADD CONSTRAINT check_max_attempts_positive
CHECK (max_attempts > 0);

-- Ensure hourly_limit is reasonable
ALTER TABLE rate_limit_tracking
ADD CONSTRAINT check_hourly_limit_range
CHECK (hourly_limit > 0 AND hourly_limit <= 10000);
```

### NOT NULL Constraints

**Philosophy:** Make fields nullable only when truly optional

**Critical NOT NULL fields:**
- Foreign keys (user_id, campaign_id)
- Email addresses (recipient_email)
- Timestamps (scheduled_time, created_at)
- Status fields (status)
- Counter fields (attempts, emails_sent)

**Nullable fields (intentional):**
- sent_at (NULL until sent)
- error_message (NULL if no error)
- completed_at (NULL until completed)
- job_id (NULL before queued)

---

## Scalability Considerations

### Horizontal Scaling (Multiple Workers)

**Challenge:** Multiple workers reading/writing same database

**Solutions Implemented:**

1. **Row-Level Locking**
```sql
-- Lock specific rate limit record
SELECT * FROM rate_limit_tracking
WHERE user_id = ? AND hour_window = ?
FOR UPDATE;
```

2. **Atomic Operations**
```sql
-- Increment without race conditions
UPDATE rate_limit_tracking
SET emails_sent = emails_sent + 1
WHERE user_id = ? AND hour_window = ?;
```

3. **Job Queue Isolation**
- BullMQ ensures one worker per job
- Database just tracks metadata

4. **Idempotency Keys**
- Unique constraint prevents duplicate processing
- Safe to retry operations

### Vertical Scaling (Large Datasets)

**Current Bottlenecks:**

1. **scheduled_emails table growth**
   - Millions of rows over time
   - **Solution:** Partition by created_at

```sql
-- PostgreSQL 10+ Partitioning
CREATE TABLE scheduled_emails (
    -- ... fields
) PARTITION BY RANGE (created_at);

CREATE TABLE scheduled_emails_2025_02 PARTITION OF scheduled_emails
FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE scheduled_emails_2025_03 PARTITION OF scheduled_emails
FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
```

2. **email_send_logs table growth**
   - Append-only, grows fastest
   - **Solution:** Archive old logs

```sql
-- Move to archive table
CREATE TABLE email_send_logs_archive (LIKE email_send_logs);

INSERT INTO email_send_logs_archive
SELECT * FROM email_send_logs
WHERE created_at < NOW() - INTERVAL '90 days';

DELETE FROM email_send_logs
WHERE created_at < NOW() - INTERVAL '90 days';
```

3. **rate_limit_tracking cleanup**
   - One row per user per hour
   - **Solution:** Scheduled cleanup

```sql
-- Daily cleanup job
DELETE FROM rate_limit_tracking
WHERE hour_window < NOW() - INTERVAL '7 days';
```

### Read Replicas

**Pattern:** Separate read and write workloads

```typescript
// Write to primary
await primaryDB.scheduled_emails.create({ ... });

// Read from replica (dashboard queries)
const campaigns = await replicaDB.email_campaigns.findMany({
    where: { user_id }
});
```

**What to replicate:**
- Dashboard queries (user campaigns, sent emails)
- Analytics queries
- Log queries

**What NOT to replicate:**
- Worker job queries (need latest data)
- Rate limit checks (need strong consistency)

### Connection Pooling

**Problem:** Too many database connections

**Solution:** Pool configuration

```typescript
// Prisma example
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  pool_timeout = 10
  connection_limit = 20
}

// Knex example
const pool = {
  min: 2,
  max: 10,
  acquireTimeoutMillis: 30000,
  idleTimeoutMillis: 30000
};
```

**Recommended Pool Sizes:**
- **Web API servers:** 10-20 connections per instance
- **Worker processes:** 5-10 connections per instance
- **Total:** (num_instances × pool_size) should not exceed PostgreSQL max_connections

### Caching Strategy

**What to cache:**

1. **System Config** (rarely changes)
   - Cache in memory with 1-5 minute TTL
   - Invalidate on update

2. **User Data** (changes occasionally)
   - Cache in Redis with 10 minute TTL
   - Invalidate on user update

3. **SMTP Configs** (rarely changes)
   - Cache in memory with 30 minute TTL

**What NOT to cache:**
- scheduled_emails (changes frequently)
- rate_limit_tracking (needs strong consistency)
- email_send_logs (append-only, no cache benefit)

---

## Backend Development Guidelines

### Transaction Patterns

**When to use transactions:**

1. **Creating campaign + scheduling emails**
```typescript
await db.$transaction(async (tx) => {
    // 1. Create campaign
    const campaign = await tx.email_campaigns.create({ ... });
    
    // 2. Create all scheduled emails
    await tx.scheduled_emails.createMany({
        data: recipients.map(r => ({ campaign_id: campaign.id, ... }))
    });
    
    // 3. Update campaign total
    await tx.email_campaigns.update({
        where: { id: campaign.id },
        data: { total_recipients: recipients.length }
    });
});
```

2. **Sending email + updating counters**
```typescript
await db.$transaction(async (tx) => {
    // 1. Mark email as processing
    await tx.scheduled_emails.update({
        where: { id: emailId },
        data: { status: 'processing' }
    });
    
    // 2. Send email (external call - keep transaction short!)
    const result = await sendViaSmtp(email);
    
    // 3. Update email status
    await tx.scheduled_emails.update({
        where: { id: emailId },
        data: { status: 'sent', sent_at: new Date(), smtp_message_id: result.messageId }
    });
    
    // 4. Increment campaign counter
    await tx.email_campaigns.update({
        where: { id: campaignId },
        data: { 
            emails_sent: { increment: 1 },
            emails_pending: { decrement: 1 }
        }
    });
    
    // 5. Increment rate limit
    await tx.rate_limit_tracking.updateMany({
        where: { user_id: userId, hour_window: currentHour },
        data: { emails_sent: { increment: 1 } }
    });
});
```

**Transaction Guidelines:**
- Keep transactions SHORT (< 1 second)
- Don't make external API calls inside transactions
- Use pessimistic locking (FOR UPDATE) when needed
- Handle deadlocks with retry logic

### Error Handling Patterns

**Database Error Codes:**
```typescript
enum PostgresError {
    UNIQUE_VIOLATION = '23505',
    FOREIGN_KEY_VIOLATION = '23503',
    NOT_NULL_VIOLATION = '23502',
    CHECK_VIOLATION = '23514'
}

function handleDatabaseError(error: any) {
    switch (error.code) {
        case PostgresError.UNIQUE_VIOLATION:
            if (error.constraint === 'scheduled_emails_idempotency_key_key') {
                return { type: 'DUPLICATE_EMAIL', message: 'Email already scheduled' };
            }
            break;
            
        case PostgresError.FOREIGN_KEY_VIOLATION:
            return { type: 'INVALID_REFERENCE', message: 'Referenced record not found' };
            
        case PostgresError.NOT_NULL_VIOLATION:
            return { type: 'MISSING_REQUIRED_FIELD', message: `${error.column} is required` };
    }
    
    return { type: 'UNKNOWN_ERROR', message: error.message };
}
```

### Query Optimization Checklist

✅ **Use prepared statements** (prevent SQL injection, better performance)
✅ **Use indexes** on WHERE, JOIN, ORDER BY columns
✅ **Limit results** (avoid SELECT * without LIMIT)
✅ **Use COUNT(*) wisely** (expensive on large tables)
✅ **Batch inserts** (createMany vs multiple creates)
✅ **Avoid N+1 queries** (use joins or eager loading)
✅ **Use connection pooling**
✅ **Monitor slow queries** (pg_stat_statements)

### Security Best Practices

1. **Never store plaintext passwords**
```typescript
// ❌ WRONG
await db.smtp_configurations.create({
    smtp_password: 'plaintext123'
});

// ✅ RIGHT
await db.smtp_configurations.create({
    smtp_password_encrypted: encrypt('plaintext123')
});
```

2. **Use parameterized queries**
```typescript
// ❌ WRONG (SQL injection risk)
await db.$queryRaw(`SELECT * FROM users WHERE email = '${userInput}'`);

// ✅ RIGHT
await db.$queryRaw`SELECT * FROM users WHERE email = ${userInput}`;
```

3. **Validate user input**
```typescript
import { z } from 'zod';

const campaignSchema = z.object({
    subject: z.string().min(1).max(500),
    body: z.string().min(1),
    recipients: z.array(z.string().email()).min(1).max(1000),
    start_time: z.date().min(new Date()),
    delay_between_emails_seconds: z.number().min(1).max(3600)
});

const validated = campaignSchema.parse(input);
```

4. **Implement rate limiting at API level**
```typescript
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: 'Too many requests from this IP'
});

app.use('/api/', apiLimiter);
```

---

## Summary

This database design provides:

✅ **Persistence** - All scheduling data in PostgreSQL  
✅ **Idempotency** - Unique constraints prevent duplicates  
✅ **Rate Limiting** - Atomic hour-window based tracking  
✅ **Audit Trail** - Complete event logging  
✅ **Failure Handling** - Retry logic with attempt tracking  
✅ **Scalability** - Indexed for performance, partition-ready  
✅ **Multi-tenancy** - User isolation and per-user configs  
✅ **BullMQ Integration** - Persistent job metadata  
✅ **Observability** - Views, logs, and monitoring queries  

**This documentation is your single source of truth for database architecture. Update this document as the system evolves.**

---

**Last Updated:** February 2025  
**Version:** 1.0  
**Maintainer:** Backend Team
