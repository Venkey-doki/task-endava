// ========== APP LOGIC ==========
// Handles rendering and interactivity for all authenticated pages.
// All data comes from localStorage via db.js

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    // Run simulation on every page load
    simulateCampaignProgress();

    // ========== DASHBOARD ==========
    if (path.includes('dashboard')) {
        renderDashboard();
    }

    // ========== CAMPAIGN DETAILS ==========
    if (path.includes('campaign-details')) {
        renderCampaignDetailsPage();
    }

    // ========== COMPOSE ==========
    if (path.includes('compose')) {
        initComposePage();
    }

    // ========== PROFILE ==========
    if (path.includes('profile')) {
        initProfilePage();
    }
});

// DASHBOARD RENDERING

function renderDashboard() {
    const campaigns = getCampaigns();
    const grid = document.getElementById('campaignsGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (campaigns.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <span class="material-icons-outlined empty-state-icon">campaign</span>
                <div class="empty-state-title">No campaigns yet</div>
                <div class="empty-state-desc">Create your first email campaign to start reaching your audience. Upload a CSV of recipients, compose your message, and schedule it!</div>
                <a href="compose.html" class="empty-state-btn">Create Campaign</a>
            </div>
        `;
        return;
    }

    campaigns.forEach((camp, idx) => {
        const statusIcons = {
            active: 'play_circle',
            pending: 'schedule',
            paused: 'pause_circle',
            completed: 'check_circle',
            cancelled: 'cancel'
        };
        const icon = statusIcons[camp.status] || 'help_outline';
        const label = camp.status.charAt(0).toUpperCase() + camp.status.slice(1);

        const card = document.createElement('div');
        card.className = 'campaign-card animate-in';
        card.style.animationDelay = `${idx * 60}ms`;
        card.id = `campaign-card-${camp.id}`;
        card.onclick = () => {
            window.location.href = `campaign-details.html?id=${camp.id}`;
        };
        card.innerHTML = `
            <div class="campaign-header">
                <span class="campaign-title" title="${camp.name}">${camp.name}</span>
                <span class="status-badge ${camp.status}">
                    <span class="material-icons-outlined">${icon}</span>${label}
                </span>
            </div>
            <div class="campaign-subject" title="${camp.subject}">Subject: ${camp.subject}</div>
            <div class="campaign-metrics">
                <div class="metric-box">
                    <span class="metric-label">Total</span>
                    <span class="metric-val">${camp.total_recipients.toLocaleString()}</span>
                </div>
                <div class="metric-box">
                    <span class="metric-label">Sent</span>
                    <span class="metric-val" style="color: var(--green-600)">${camp.emails_sent.toLocaleString()}</span>
                </div>
                <div class="metric-box">
                    <span class="metric-label" style="color: ${camp.emails_failed > 0 ? 'var(--red-500)' : ''}">Failed</span>
                    <span class="metric-val" style="color: ${camp.emails_failed > 0 ? 'var(--red-500)' : ''}">${camp.emails_failed}</span>
                </div>
                <div class="metric-box">
                    <span class="metric-label">Pending</span>
                    <span class="metric-val" style="color: ${camp.emails_pending > 0 ? 'var(--orange-500)' : ''}">${camp.emails_pending.toLocaleString()}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ========== CAMPAIGN DETAILS PAGE ==========

function renderCampaignDetailsPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const campId = urlParams.get('id');
    if (!campId) {
        showToast('Campaign not found', 'error');
        return;
    }

    const campaign = getCampaignById(campId);
    if (!campaign) {
        showToast('Campaign not found', 'error');
        return;
    }

    const emails = getEmailsByCampaign(campId);

    // Header
    const titleEl = document.getElementById('detailCampaignName');
    if (titleEl) titleEl.textContent = campaign.name;

    const statusEl = document.getElementById('detailCampaignStatus');
    if (statusEl) {
        const statusIcons = { active: 'play_circle', pending: 'schedule', paused: 'pause_circle', completed: 'check_circle', cancelled: 'cancel' };
        statusEl.className = `status-badge ${campaign.status}`;
        statusEl.innerHTML = `<span class="material-icons-outlined">${statusIcons[campaign.status] || 'help'}</span>${campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}`;
    }

    // Stats cards
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setVal('statTotal', campaign.total_recipients);
    setVal('statSent', campaign.emails_sent);
    setVal('statFailed', campaign.emails_failed);
    setVal('statPending', campaign.emails_pending);

    // Progress
    const processed = campaign.emails_sent + campaign.emails_failed;
    const total = campaign.total_recipients || 1;
    const pct = Math.round((processed / total) * 100);

    const progressPct = document.getElementById('progressPct');
    if (progressPct) progressPct.textContent = `${pct}%`;
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        setTimeout(() => { progressFill.style.width = `${pct}%`; }, 100);
    }

    // Campaign info
    setVal('infoSubject', campaign.subject);
    setVal('infoStartTime', formatDateNice(campaign.start_time));
    setVal('infoCreatedAt', formatDateNice(campaign.created_at));
    setVal('infoStatus', campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1));
    setVal('infoDelay', `${campaign.delay_between_emails_seconds || 5}s`);
    setVal('infoHourlyLimit', campaign.hourly_limit || 100);

    const bodyEl = document.getElementById('infoBody');
    if (bodyEl) bodyEl.innerHTML = campaign.body || '<em>No content</em>';

    // Email list tabs
    const allTab = document.getElementById('emailsAll');
    const sentTab = document.getElementById('emailsSent');
    const failedTab = document.getElementById('emailsFailed');
    const pendingTab = document.getElementById('emailsPending');

    function renderEmailList(container, emailList) {
        if (!container) return;
        container.innerHTML = '';
        if (emailList.length === 0) {
            container.innerHTML = '<div style="padding: 24px; color: var(--text-tertiary); text-align: center;">No emails in this category.</div>';
            return;
        }
        emailList.forEach(em => {
            const badgeClass = em.status;
            const badgeIcon = em.status === 'sent' ? 'check_circle' : em.status === 'failed' ? 'error' : 'schedule';
            const timeStr = em.sent_at ? formatDateShort(em.sent_at) : formatDateShort(em.scheduled_time);
            const row = document.createElement('div');
            row.className = 'email-row';
            row.innerHTML = `
                <div class="email-recipient">${em.recipient_email}</div>
                <span class="email-badge ${badgeClass}">
                    <span class="material-icons-outlined">${badgeIcon}</span>
                    ${em.status.charAt(0).toUpperCase() + em.status.slice(1)}
                </span>
                <span class="email-preview">${em.error_message || timeStr}</span>
                <span class="email-preview" style="text-align: right; flex-shrink: 0; width: auto;">${timeStr}</span>
            `;
            container.appendChild(row);
        });
    }

    renderEmailList(allTab, emails);
    renderEmailList(sentTab, emails.filter(e => e.status === 'sent'));
    renderEmailList(failedTab, emails.filter(e => e.status === 'failed'));
    renderEmailList(pendingTab, emails.filter(e => e.status === 'scheduled'));

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabId = btn.dataset.tab;
            const content = document.getElementById(tabId);
            if (content) content.classList.add('active');
        });
    });
}

// ========== COMPOSE PAGE ==========

function initComposePage() {
    let csvEmails = [];
    const csvInput = document.getElementById('csvFileInput');
    const csvUploadArea = document.getElementById('csvUploadArea');
    const csvPreview = document.getElementById('csvPreview');
    const csvCount = document.getElementById('csvEmailCount');
    const csvEmailList = document.getElementById('csvEmailList');
    const csvClear = document.getElementById('csvClearBtn');

    // CSV Upload
    if (csvUploadArea) {
        csvUploadArea.addEventListener('click', () => csvInput && csvInput.click());

        csvUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            csvUploadArea.classList.add('dragover');
        });
        csvUploadArea.addEventListener('dragleave', () => {
            csvUploadArea.classList.remove('dragover');
        });
        csvUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            csvUploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) handleCSVFile(file);
        });
    }

    if (csvInput) {
        csvInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleCSVFile(file);
        });
    }

    function handleCSVFile(file) {
        if (!file.name.endsWith('.csv')) {
            showToast('Please upload a .csv file', 'warning');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = parseCSVForEmails(e.target.result);
            if (!result.success) {
                showToast(result.error, 'error');
                return;
            }
            csvEmails = result.emails;
            showToast(`${csvEmails.length} email addresses loaded`, 'success');
            renderCSVPreview();
        };
        reader.readAsText(file);
    }

    function renderCSVPreview() {
        if (!csvPreview || !csvCount || !csvEmailList) return;
        if (csvEmails.length === 0) {
            csvPreview.style.display = 'none';
            if (csvUploadArea) csvUploadArea.style.display = '';
            return;
        }

        csvPreview.style.display = 'block';
        if (csvUploadArea) csvUploadArea.style.display = 'none';
        csvCount.textContent = `${csvEmails.length} recipients loaded`;
        csvEmailList.innerHTML = '';
        csvEmails.forEach(email => {
            csvEmailList.insertAdjacentHTML('beforeend',
                `<span class="recipient-chip">${email}</span>`
            );
        });
    }

    if (csvClear) {
        csvClear.addEventListener('click', () => {
            csvEmails = [];
            if (csvInput) csvInput.value = '';
            renderCSVPreview();
            showToast('Recipients cleared', 'info');
        });
    }

    // Toolbar
    document.querySelectorAll('.toolbar-btn[data-cmd]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.cmd;
            document.execCommand(cmd, false, null);
            btn.classList.toggle('active');
        });
    });

    // Create Campaign
    const createBtn = document.getElementById('createCampaignBtn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            const name = document.getElementById('campaignName')?.value.trim();
            const subject = document.getElementById('campaignSubject')?.value.trim();
            const body = document.getElementById('campaignBody')?.innerHTML.trim();
            const date = document.getElementById('scheduleDate')?.value;
            const time = document.getElementById('scheduleTime')?.value;

            // Validation
            if (!name) { showToast('Please enter a campaign name', 'warning'); return; }
            if (!subject) { showToast('Please enter an email subject', 'warning'); return; }
            if (!body || body === '<br>') { showToast('Please enter email body content', 'warning'); return; }
            if (csvEmails.length === 0) { showToast('Please upload a CSV file with recipient emails', 'warning'); return; }
            if (!date) { showToast('Please select a schedule date', 'warning'); return; }
            if (!time) { showToast('Please select a schedule time', 'warning'); return; }

            const startTime = new Date(`${date}T${time}`);
            if (isNaN(startTime.getTime())) {
                showToast('Invalid date/time selected', 'error');
                return;
            }

            if (startTime <= new Date()) {
                showToast('Schedule time must be in the future', 'warning');
                return;
            }

            // Create campaign
            const result = addCampaign({
                name,
                subject,
                body,
                start_time: startTime.toISOString(),
                total_recipients: csvEmails.length,
                delay: 5,
                hourly_limit: 100
            });

            if (!result.success) {
                showToast(result.error || 'Failed to create campaign', 'error');
                return;
            }

            // Create scheduled emails
            addScheduledEmails(
                result.campaign.id,
                csvEmails,
                subject,
                body,
                startTime.toISOString(),
                5
            );

            showToast('Campaign created successfully!', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 800);
        });
    }
}

// ========== PROFILE PAGE ==========

function initProfilePage() {
    const session = getSession();
    if (!session) return;

    const user = getUserByEmail(session.email);
    if (!user) return;

    // Populate profile fields
    const nameInput = document.getElementById('profileName');
    const emailInput = document.getElementById('profileEmail');
    const memberSince = document.getElementById('memberSince');
    const lastUpdated = document.getElementById('lastUpdated');

    if (nameInput) nameInput.value = user.name;
    if (emailInput) emailInput.value = user.email;
    if (memberSince) memberSince.textContent = formatDateNice(user.created_at);
    if (lastUpdated) lastUpdated.textContent = formatDateNice(user.updated_at);

    // Account stats
    const stats = getUserStats(session.id);
    const setStatVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setStatVal('profileStatCampaigns', stats.totalCampaigns);
    setStatVal('profileStatActive', stats.activeCampaigns);
    setStatVal('profileStatCompleted', stats.completedCampaigns);
    setStatVal('profileStatEmails', stats.totalEmails);
    setStatVal('profileStatSent', stats.emailsSent);
    setStatVal('profileStatFailed', stats.emailsFailed);

    // Save Profile
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const newName = nameInput?.value.trim();
            const newEmail = emailInput?.value.trim();
            if (!newName) { showToast('Name is required', 'warning'); return; }
            if (!newEmail) { showToast('Email is required', 'warning'); return; }

            // Check if email is taken by another user
            const existingUser = getUserByEmail(newEmail);
            if (existingUser && existingUser.id !== session.id) {
                showToast('Email is already in use by another account', 'error');
                return;
            }

            const result = updateUser(session.id, { name: newName, email: newEmail });
            if (result.success) {
                showToast('Profile updated successfully', 'success');
                // Update sidebar user info
                document.querySelectorAll('.auth-user-name').forEach(el => el.textContent = newName);
                document.querySelectorAll('.auth-user-email').forEach(el => el.textContent = newEmail);
            } else {
                showToast(result.error || 'Failed to update profile', 'error');
            }
        });
    }

    // Change Password
    const changePassBtn = document.getElementById('changePasswordBtn');
    if (changePassBtn) {
        changePassBtn.addEventListener('click', async () => {
            const current = document.getElementById('currentPassword')?.value;
            const newPass = document.getElementById('newPassword')?.value;
            const confirmPass = document.getElementById('confirmPassword')?.value;

            if (!current) { showToast('Enter your current password', 'warning'); return; }
            if (!newPass) { showToast('Enter a new password', 'warning'); return; }
            if (newPass !== confirmPass) { showToast('Passwords do not match', 'error'); return; }

            const result = await changePassword(session.id, current, newPass);
            if (result.success) {
                showToast('Password changed successfully', 'success');
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmPassword').value = '';
            } else {
                showToast(result.error, 'error');
            }
        });
    }

    // SMTP Configurations
    renderSmtpConfigs();

    const addSmtpBtn = document.getElementById('addSmtpBtn');
    if (addSmtpBtn) {
        addSmtpBtn.addEventListener('click', () => {
            const form = document.getElementById('smtpForm');
            if (form) {
                form.style.display = form.style.display === 'none' ? 'block' : 'none';
            }
        });
    }

    const saveSmtpBtn = document.getElementById('saveSmtpBtn');
    if (saveSmtpBtn) {
        saveSmtpBtn.addEventListener('click', () => {
            const name = document.getElementById('smtpName')?.value.trim();
            const host = document.getElementById('smtpHost')?.value.trim();
            const port = parseInt(document.getElementById('smtpPort')?.value) || 587;
            const username = document.getElementById('smtpUsername')?.value.trim();
            const password = document.getElementById('smtpPassword')?.value;
            const fromEmail = document.getElementById('smtpFromEmail')?.value.trim();
            const fromName = document.getElementById('smtpFromName')?.value.trim();
            const hourlyLimit = parseInt(document.getElementById('smtpHourlyLimit')?.value) || 100;
            const dailyLimit = parseInt(document.getElementById('smtpDailyLimit')?.value) || 1000;

            if (!name) { showToast('Configuration name is required', 'warning'); return; }
            if (!host) { showToast('SMTP host is required', 'warning'); return; }
            if (!username) { showToast('SMTP username is required', 'warning'); return; }
            if (!fromEmail) { showToast('From email is required', 'warning'); return; }

            const result = addSmtpConfig({
                name, smtp_host: host, smtp_port: port,
                smtp_username: username, smtp_password: password,
                from_email: fromEmail, from_name: fromName,
                hourly_limit: hourlyLimit, daily_limit: dailyLimit
            });

            if (result.success) {
                showToast('SMTP configuration added', 'success');
                renderSmtpConfigs();
                document.getElementById('smtpForm').style.display = 'none';
                // Clear form
                ['smtpName','smtpHost','smtpUsername','smtpPassword','smtpFromEmail','smtpFromName'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                document.getElementById('smtpPort').value = '587';
                document.getElementById('smtpHourlyLimit').value = '100';
                document.getElementById('smtpDailyLimit').value = '1000';
            } else {
                showToast(result.error || 'Failed to add SMTP config', 'error');
            }
        });
    }

    // Delete Account
    const deleteBtn = document.getElementById('deleteAccountBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const confirmArea = document.getElementById('deleteConfirmArea');
            if (confirmArea) confirmArea.style.display = 'block';
        });
    }
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', () => {
            const typed = document.getElementById('deleteConfirmInput')?.value;
            if (typed !== 'DELETE') {
                showToast('Please type DELETE to confirm', 'warning');
                return;
            }
            deleteUserAccount(session.id);
            showToast('Account deleted. Goodbye!', 'info');
            setTimeout(() => { window.location.href = 'login.html'; }, 1000);
        });
    }
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            document.getElementById('deleteConfirmArea').style.display = 'none';
            document.getElementById('deleteConfirmInput').value = '';
        });
    }
}

function renderSmtpConfigs() {
    const list = document.getElementById('smtpConfigsList');
    if (!list) return;
    const configs = getSmtpConfigs();
    list.innerHTML = '';

    if (configs.length === 0) {
        list.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-tertiary);">No SMTP configurations yet. Add one to start sending real emails.</div>';
        return;
    }

    configs.forEach(cfg => {
        const card = document.createElement('div');
        card.className = 'smtp-config-card';
        card.innerHTML = `
            <div class="smtp-config-header">
                <div>
                    <div class="smtp-config-name">${cfg.name}</div>
                    <div class="smtp-config-host">${cfg.smtp_host}:${cfg.smtp_port}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="status-badge ${cfg.is_active ? 'active' : 'paused'}">
                        <span class="material-icons-outlined">${cfg.is_active ? 'check_circle' : 'pause_circle'}</span>
                        ${cfg.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button class="icon-btn smtp-delete-btn" data-id="${cfg.id}" title="Delete">
                        <span class="material-icons-outlined" style="color: var(--red-500); font-size: 18px;">delete</span>
                    </button>
                </div>
            </div>
            <div class="smtp-config-details">
                <div class="smtp-detail"><span class="smtp-detail-label">From:</span> ${cfg.from_name ? cfg.from_name + ' &lt;' + cfg.from_email + '&gt;' : cfg.from_email}</div>
                <div class="smtp-detail"><span class="smtp-detail-label">Username:</span> ${cfg.smtp_username}</div>
                <div class="smtp-detail"><span class="smtp-detail-label">Limits:</span> ${cfg.hourly_limit}/hr · ${cfg.daily_limit}/day</div>
                <div class="smtp-detail"><span class="smtp-detail-label">Added:</span> ${formatDateShort(cfg.created_at)}</div>
            </div>
        `;
        list.appendChild(card);
    });

    // Bind delete buttons
    list.querySelectorAll('.smtp-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            deleteSmtpConfig(btn.dataset.id);
            showToast('SMTP configuration removed', 'info');
            renderSmtpConfigs();
        });
    });
}
