const DB_KEYS = {
    USERS: 'velo_users',
    CAMPAIGNS: 'velo_campaigns',
    SCHEDULED_EMAILS: 'velo_scheduled_emails',
    SMTP_CONFIGS: 'velo_smtp_configs',
    THEME: 'velo_theme',
    SEEDED: 'velo_data_seeded'
};

//GENERIC HELPERS 

function dbGet(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error(`DB read error for ${key}:`, e);
        return [];
    }
}

function dbSet(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error(`DB write error for ${key}:`, e);
    }
}

function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

//PASSWORD HASHING 

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// USER OPERATIONS

function getUsers() {
    return dbGet(DB_KEYS.USERS);
}

function getUserByEmail(email) {
    const users = getUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

async function addUser(userData) {
    const users = getUsers();
    const existing = users.find(u => u.email.toLowerCase() === userData.email.toLowerCase());
    if (existing) return { success: false, error: 'Email already registered' };

    const hashedPassword = await hashPassword(userData.password);
    const newUser = {
        id: generateId(),
        email: userData.email,
        name: userData.name,
        password: hashedPassword,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    users.push(newUser);
    dbSet(DB_KEYS.USERS, users);
    return { success: true, user: newUser };
}

async function validateLogin(email, password) {
    const user = getUserByEmail(email);
    if (!user) return { success: false, error: 'No account found with this email' };
    const hashedInput = await hashPassword(password);
    if (user.password !== hashedInput) return { success: false, error: 'Incorrect password' };
    return { success: true, user: user };
}

// SESSION OPERATIONS

function setSession(user) {
    const sessionData = {
        id: user.id,
        email: user.email,
        name: user.name,
        logged_in_at: new Date().toISOString()
    };
    sessionStorage.setItem('velo_session', JSON.stringify(sessionData));
}

function getSession() {
    try {
        const data = sessionStorage.getItem('velo_session');
        return data ? JSON.parse(data) : null;
    } catch (e) {
        return null;
    }
}

function clearSession() {
    sessionStorage.removeItem('velo_session');
}

// PROFILE / USER UPDATE OPERATIONS

function updateUser(userId, updates) {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return { success: false, error: 'User not found' };
    users[idx] = { ...users[idx], ...updates, updated_at: new Date().toISOString() };
    dbSet(DB_KEYS.USERS, users);
    // Also update session if name/email changed
    const session = getSession();
    if (session && session.id === userId) {
        if (updates.name) session.name = updates.name;
        if (updates.email) session.email = updates.email;
        sessionStorage.setItem('velo_session', JSON.stringify(session));
    }
    return { success: true, user: users[idx] };
}

function getUserStats(userId) {
    const campaigns = dbGet(DB_KEYS.CAMPAIGNS).filter(c => c.user_id === userId);
    const emails = dbGet(DB_KEYS.SCHEDULED_EMAILS).filter(e => e.user_id === userId);
    return {
        totalCampaigns: campaigns.length,
        activeCampaigns: campaigns.filter(c => c.status === 'active').length,
        completedCampaigns: campaigns.filter(c => c.status === 'completed').length,
        totalEmails: emails.length,
        emailsSent: emails.filter(e => e.status === 'sent').length,
        emailsFailed: emails.filter(e => e.status === 'failed').length,
        emailsPending: emails.filter(e => e.status === 'scheduled').length
    };
}

// SMTP CONFIGURATION OPERATIONS

function getSmtpConfigs() {
    const session = getSession();
    if (!session) return [];
    return dbGet(DB_KEYS.SMTP_CONFIGS).filter(s => s.user_id === session.id);
}

function addSmtpConfig(configData) {
    const session = getSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const configs = dbGet(DB_KEYS.SMTP_CONFIGS);
    const newConfig = {
        id: generateId(),
        user_id: session.id,
        name: configData.name,
        smtp_host: configData.smtp_host,
        smtp_port: configData.smtp_port || 587,
        smtp_secure: configData.smtp_secure || false,
        smtp_username: configData.smtp_username,
        smtp_password_encrypted: configData.smtp_password || '',
        from_email: configData.from_email,
        from_name: configData.from_name || '',
        is_active: true,
        is_verified: false,
        hourly_limit: configData.hourly_limit || 100,
        daily_limit: configData.daily_limit || 1000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_used_at: null
    };
    configs.push(newConfig);
    dbSet(DB_KEYS.SMTP_CONFIGS, configs);
    return { success: true, config: newConfig };
}

function updateSmtpConfig(configId, updates) {
    const configs = dbGet(DB_KEYS.SMTP_CONFIGS);
    const idx = configs.findIndex(c => c.id === configId);
    if (idx === -1) return false;
    configs[idx] = { ...configs[idx], ...updates, updated_at: new Date().toISOString() };
    dbSet(DB_KEYS.SMTP_CONFIGS, configs);
    return true;
}

function deleteSmtpConfig(configId) {
    const configs = dbGet(DB_KEYS.SMTP_CONFIGS);
    const filtered = configs.filter(c => c.id !== configId);
    dbSet(DB_KEYS.SMTP_CONFIGS, filtered);
    return true;
}

//CAMPAIGN OPERATIONS

function getCampaigns() {
    const session = getSession();
    if (!session) return [];
    const all = dbGet(DB_KEYS.CAMPAIGNS);
    return all.filter(c => c.user_id === session.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getAllCampaigns() {
    return dbGet(DB_KEYS.CAMPAIGNS);
}

function getCampaignById(id) {
    const all = dbGet(DB_KEYS.CAMPAIGNS);
    return all.find(c => c.id === id) || null;
}

function addCampaign(campaignData) {
    const session = getSession();
    if (!session) return { success: false, error: 'Not authenticated' };

    const campaigns = dbGet(DB_KEYS.CAMPAIGNS);
    const newCampaign = {
        id: generateId(),
        user_id: session.id,
        name: campaignData.name,
        subject: campaignData.subject,
        body: campaignData.body,
        start_time: campaignData.start_time,
        delay_between_emails_seconds: campaignData.delay || 5,
        hourly_limit: campaignData.hourly_limit || 100,
        total_recipients: campaignData.total_recipients || 0,
        emails_sent: 0,
        emails_failed: 0,
        emails_pending: campaignData.total_recipients || 0,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null
    };
    campaigns.push(newCampaign);
    dbSet(DB_KEYS.CAMPAIGNS, campaigns);
    return { success: true, campaign: newCampaign };
}

function updateCampaign(id, updates) {
    const campaigns = dbGet(DB_KEYS.CAMPAIGNS);
    const idx = campaigns.findIndex(c => c.id === id);
    if (idx === -1) return false;
    campaigns[idx] = { ...campaigns[idx], ...updates, updated_at: new Date().toISOString() };
    dbSet(DB_KEYS.CAMPAIGNS, campaigns);
    return true;
}

//SCHEDULED EMAIL OPERATIONS

function getScheduledEmails() {
    return dbGet(DB_KEYS.SCHEDULED_EMAILS);
}

function getEmailsByCampaign(campaignId) {
    const all = getScheduledEmails();
    return all.filter(e => e.campaign_id === campaignId);
}

function addScheduledEmails(campaignId, emails, subject, body, startTime, delaySeconds) {
    const session = getSession();
    if (!session) return [];

    const existing = dbGet(DB_KEYS.SCHEDULED_EMAILS);
    const newEmails = emails.map((email, index) => {
        const scheduledTime = new Date(new Date(startTime).getTime() + (index * delaySeconds * 1000));
        return {
            id: generateId(),
            campaign_id: campaignId,
            user_id: session.id,
            recipient_email: email.trim(),
            subject: subject,
            body: body,
            scheduled_time: scheduledTime.toISOString(),
            sent_at: null,
            status: 'scheduled',
            attempts: 0,
            max_attempts: 3,
            error_message: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    });

    dbSet(DB_KEYS.SCHEDULED_EMAILS, [...existing, ...newEmails]);
    return newEmails;
}

function updateScheduledEmail(emailId, updates) {
    const emails = dbGet(DB_KEYS.SCHEDULED_EMAILS);
    const idx = emails.findIndex(e => e.id === emailId);
    if (idx === -1) return false;
    emails[idx] = { ...emails[idx], ...updates, updated_at: new Date().toISOString() };
    dbSet(DB_KEYS.SCHEDULED_EMAILS, emails);
    return true;
}

// ========== SIMULATION ENGINE ==========
// This module can be replaced with real API calls in production.
// It simulates email sending by transitioning statuses over time.

function simulateCampaignProgress() {
    const campaigns = dbGet(DB_KEYS.CAMPAIGNS);
    const emails = dbGet(DB_KEYS.SCHEDULED_EMAILS);
    let campaignsChanged = false;
    let emailsChanged = false;
    const now = new Date();

    campaigns.forEach(campaign => {
        if (campaign.status === 'completed' || campaign.status === 'cancelled') return;

        const campaignEmails = emails.filter(e => e.campaign_id === campaign.id);
        const startTime = new Date(campaign.start_time);

        // Activate campaign if start_time has passed
        if (campaign.status === 'pending' && startTime <= now) {
            campaign.status = 'active';
            campaign.updated_at = now.toISOString();
            campaignsChanged = true;
        }

        if (campaign.status === 'active') {
            campaignEmails.forEach(email => {
                if (email.status === 'scheduled') {
                    const scheduledTime = new Date(email.scheduled_time);
                    if (scheduledTime <= now) {
                        // Simulate: 92% success, 8% fail
                        const success = Math.random() > 0.08;
                        email.status = success ? 'sent' : 'failed';
                        email.sent_at = now.toISOString();
                        if (!success) {
                            email.error_message = ['SMTP Connection Timeout', 'Mailbox full', 'Invalid recipient', 'Rate limit exceeded'][Math.floor(Math.random() * 4)];
                        }
                        email.attempts = 1;
                        email.updated_at = now.toISOString();
                        emailsChanged = true;

                        // Update campaign counters
                        if (success) {
                            campaign.emails_sent = (campaign.emails_sent || 0) + 1;
                        } else {
                            campaign.emails_failed = (campaign.emails_failed || 0) + 1;
                        }
                        campaign.emails_pending = Math.max(0, (campaign.emails_pending || 0) - 1);
                        campaign.updated_at = now.toISOString();
                        campaignsChanged = true;
                    }
                }
            });

            // Check if campaign is complete
            const pending = campaignEmails.filter(e => e.status === 'scheduled').length;
            if (pending === 0 && campaignEmails.length > 0) {
                campaign.status = 'completed';
                campaign.completed_at = now.toISOString();
                campaign.updated_at = now.toISOString();
                campaignsChanged = true;
            }
        }
    });

    if (campaignsChanged) dbSet(DB_KEYS.CAMPAIGNS, campaigns);
    if (emailsChanged) dbSet(DB_KEYS.SCHEDULED_EMAILS, emails);
}

// ========== SEED INITIAL DATA ==========

async function seedInitialData() {
    if (localStorage.getItem(DB_KEYS.SEEDED)) return;

    // Seed default admin user (password is SHA-256 hashed)
    const adminPasswordHash = await hashPassword('admin@pass');
    const users = [{
        id: 'user_admin_001',
        email: 'admin@example.com',
        name: 'Admin User',
        password: adminPasswordHash,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
    }];
    dbSet(DB_KEYS.USERS, users);

    // Seed campaigns
    const now = new Date();
    const campaigns = [
        {
            id: 'camp_001',
            user_id: 'user_admin_001',
            name: 'Welcome Series Q3',
            subject: 'Welcome to Velo! Let\'s get started...',
            body: '<p>Hi there!</p><p>Welcome to Velo. We\'re thrilled to have you on board. In this email, we\'ll walk you through the key features of our platform and help you get started with your first campaign.</p><p>Best regards,<br>The Velo Team</p>',
            start_time: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            delay_between_emails_seconds: 60,
            hourly_limit: 100,
            total_recipients: 12,
            emails_sent: 8,
            emails_failed: 1,
            emails_pending: 3,
            status: 'active',
            created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: now.toISOString(),
            completed_at: null
        },
        {
            id: 'camp_002',
            user_id: 'user_admin_001',
            name: 'Product Launch - Early Access',
            subject: 'Be the first to try our new features!',
            body: '<p>Dear valued customer,</p><p>We are excited to announce the launch of our latest product features. As a valued early access member, you get first dibs!</p><p>Check it out now.</p>',
            start_time: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            delay_between_emails_seconds: 30,
            hourly_limit: 200,
            total_recipients: 8,
            emails_sent: 7,
            emails_failed: 1,
            emails_pending: 0,
            status: 'completed',
            created_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
            completed_at: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
            id: 'camp_003',
            user_id: 'user_admin_001',
            name: 'Spring Sale Blast',
            subject: 'Spring into Savings! Exclusive Offers Inside',
            body: '<p>🌸 Spring Sale is here!</p><p>Get up to 50% off on our premium plans. Limited time offer - act now before it\'s gone!</p><p>Use code: SPRING50</p>',
            start_time: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            delay_between_emails_seconds: 45,
            hourly_limit: 150,
            total_recipients: 10,
            emails_sent: 6,
            emails_failed: 0,
            emails_pending: 4,
            status: 'active',
            created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: now.toISOString(),
            completed_at: null
        }
    ];
    dbSet(DB_KEYS.CAMPAIGNS, campaigns);

    // Seed scheduled emails for each campaign
    const allEmails = [];
    const emailDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'company.io', 'mail.com'];
    const firstNames = ['john', 'sarah', 'mike', 'emma', 'alex', 'olivia', 'liam', 'sophia', 'noah', 'ava', 'james', 'mia'];

    campaigns.forEach(camp => {
        for (let i = 0; i < camp.total_recipients; i++) {
            const fname = firstNames[i % firstNames.length];
            const domain = emailDomains[i % emailDomains.length];
            const recipientEmail = `${fname}.${camp.id.slice(-3)}_${i}@${domain}`;
            const scheduledTime = new Date(new Date(camp.start_time).getTime() + (i * camp.delay_between_emails_seconds * 1000));
            
            let status = 'scheduled';
            let sentAt = null;
            let errorMsg = null;

            if (i < camp.emails_sent) {
                status = 'sent';
                sentAt = new Date(scheduledTime.getTime() + 2000).toISOString();
            } else if (i < camp.emails_sent + camp.emails_failed) {
                status = 'failed';
                sentAt = new Date(scheduledTime.getTime() + 2000).toISOString();
                errorMsg = ['SMTP Connection Timeout', 'Mailbox full', 'Invalid recipient'][i % 3];
            }

            allEmails.push({
                id: generateId(),
                campaign_id: camp.id,
                user_id: camp.user_id,
                recipient_email: recipientEmail,
                subject: camp.subject,
                body: camp.body,
                scheduled_time: scheduledTime.toISOString(),
                sent_at: sentAt,
                status: status,
                attempts: status === 'scheduled' ? 0 : 1,
                max_attempts: 3,
                error_message: errorMsg,
                created_at: camp.created_at,
                updated_at: now.toISOString()
            });
        }
    });

    dbSet(DB_KEYS.SCHEDULED_EMAILS, allEmails);
    localStorage.setItem(DB_KEYS.SEEDED, 'true');
}

// ========== CSV PARSER ==========

function parseCSVForEmails(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return { success: false, error: 'CSV must have a header row and at least one data row', emails: [] };

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const emailColIndex = headers.findIndex(h => h === 'emails' || h === 'email');

    if (emailColIndex === -1) {
        return { success: false, error: 'CSV must contain a column named "emails"', emails: [] };
    }

    const emails = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/['"]/g, ''));
        const email = cols[emailColIndex];
        if (email && emailRegex.test(email)) {
            emails.push(email);
        }
    }

    if (emails.length === 0) {
        return { success: false, error: 'No valid email addresses found in the CSV', emails: [] };
    }

    return { success: true, emails: emails, error: null };
}

// ========== UTILITY ==========

function formatDateNice(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' at ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateShort(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ', ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Auto-seed on load
seedInitialData();
