function initProfilePage() {
	const session = getSession();
	if (!session) return;

	const user = getUserByEmail(session.email);
	if (!user) return;

	// Populate profile fields
	const nameInput = document.getElementById("profileName");
	const emailInput = document.getElementById("profileEmail");
	const memberSince = document.getElementById("memberSince");
	const lastUpdated = document.getElementById("lastUpdated");

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
	setStatVal("profileStatCampaigns", stats.totalCampaigns);
	setStatVal("profileStatActive", stats.activeCampaigns);
	setStatVal("profileStatCompleted", stats.completedCampaigns);
	setStatVal("profileStatEmails", stats.totalEmails);
	setStatVal("profileStatSent", stats.emailsSent);
	setStatVal("profileStatFailed", stats.emailsFailed);

	// Save Profile
	const saveBtn = document.getElementById("saveProfileBtn");
	if (saveBtn) {
		saveBtn.addEventListener("click", () => {
			const newName = nameInput?.value.trim();
			const newEmail = emailInput?.value.trim();
			if (!newName) {
				showToast("Name is required", "warning");
				return;
			}
			if (!newEmail) {
				showToast("Email is required", "warning");
				return;
			}

			// Check if email is taken by another user
			const existingUser = getUserByEmail(newEmail);
			if (existingUser && existingUser.id !== session.id) {
				showToast(
					"Email is already in use by another account",
					"error",
				);
				return;
			}

			const result = updateUser(session.id, {
				name: newName,
				email: newEmail,
			});
			if (result.success) {
				showToast("Profile updated successfully", "success");
				// Update sidebar user info
				document
					.querySelectorAll(".auth-user-name")
					.forEach((el) => (el.textContent = newName));
				document
					.querySelectorAll(".auth-user-email")
					.forEach((el) => (el.textContent = newEmail));
			} else {
				showToast(result.error || "Failed to update profile", "error");
			}
		});
	}

	// Change Password
	const changePassBtn = document.getElementById("changePasswordBtn");
	if (changePassBtn) {
		changePassBtn.addEventListener("click", async () => {
			const current = document.getElementById("currentPassword")?.value;
			const newPass = document.getElementById("newPassword")?.value;
			const confirmPass =
				document.getElementById("confirmPassword")?.value;

			if (!current) {
				showToast("Enter your current password", "warning");
				return;
			}
			if (!newPass) {
				showToast("Enter a new password", "warning");
				return;
			}
			if (newPass !== confirmPass) {
				showToast("Passwords do not match", "error");
				return;
			}

			const result = await changePassword(session.id, current, newPass);
			if (result.success) {
				showToast("Password changed successfully", "success");
				document.getElementById("currentPassword").value = "";
				document.getElementById("newPassword").value = "";
				document.getElementById("confirmPassword").value = "";
			} else {
				showToast(result.error, "error");
			}
		});
	}

	// SMTP Configurations
	renderSmtpConfigs();

	const addSmtpBtn = document.getElementById("addSmtpBtn");
	if (addSmtpBtn) {
		addSmtpBtn.addEventListener("click", () => {
			const form = document.getElementById("smtpForm");
			if (form) {
				form.style.display =
					form.style.display === "none" ? "block" : "none";
			}
		});
	}

	const saveSmtpBtn = document.getElementById("saveSmtpBtn");
	if (saveSmtpBtn) {
		saveSmtpBtn.addEventListener("click", () => {
			const name = document.getElementById("smtpName")?.value.trim();
			const host = document.getElementById("smtpHost")?.value.trim();
			const port =
				parseInt(document.getElementById("smtpPort")?.value) || 587;
			const username = document
				.getElementById("smtpUsername")
				?.value.trim();
			const password = document.getElementById("smtpPassword")?.value;
			const fromEmail = document
				.getElementById("smtpFromEmail")
				?.value.trim();
			const fromName = document
				.getElementById("smtpFromName")
				?.value.trim();
			const hourlyLimit =
				parseInt(document.getElementById("smtpHourlyLimit")?.value) ||
				100;
			const dailyLimit =
				parseInt(document.getElementById("smtpDailyLimit")?.value) ||
				1000;

			if (!name) {
				showToast("Configuration name is required", "warning");
				return;
			}
			if (!host) {
				showToast("SMTP host is required", "warning");
				return;
			}
			if (!username) {
				showToast("SMTP username is required", "warning");
				return;
			}
			if (!fromEmail) {
				showToast("From email is required", "warning");
				return;
			}

			const result = addSmtpConfig({
				name,
				smtp_host: host,
				smtp_port: port,
				smtp_username: username,
				smtp_password: password,
				from_email: fromEmail,
				from_name: fromName,
				hourly_limit: hourlyLimit,
				daily_limit: dailyLimit,
			});

			if (result.success) {
				showToast("SMTP configuration added", "success");
				renderSmtpConfigs();
				document.getElementById("smtpForm").style.display = "none";
				// Clear form
				[
					"smtpName",
					"smtpHost",
					"smtpUsername",
					"smtpPassword",
					"smtpFromEmail",
					"smtpFromName",
				].forEach((id) => {
					const el = document.getElementById(id);
					if (el) el.value = "";
				});
				document.getElementById("smtpPort").value = "587";
				document.getElementById("smtpHourlyLimit").value = "100";
				document.getElementById("smtpDailyLimit").value = "1000";
			} else {
				showToast(result.error || "Failed to add SMTP config", "error");
			}
		});
	}

	// Delete Account
	const deleteBtn = document.getElementById("deleteAccountBtn");
	if (deleteBtn) {
		deleteBtn.addEventListener("click", () => {
			const confirmArea = document.getElementById("deleteConfirmArea");
			if (confirmArea) confirmArea.style.display = "block";
		});
	}
	const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
	if (confirmDeleteBtn) {
		confirmDeleteBtn.addEventListener("click", () => {
			const typed = document.getElementById("deleteConfirmInput")?.value;
			if (typed !== "DELETE") {
				showToast("Please type DELETE to confirm", "warning");
				return;
			}
			deleteUserAccount(session.id);
			showToast("Account deleted. Goodbye!", "info");
			setTimeout(() => {
				window.location.href = "login.html";
			}, 1000);
		});
	}
	const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
	if (cancelDeleteBtn) {
		cancelDeleteBtn.addEventListener("click", () => {
			document.getElementById("deleteConfirmArea").style.display = "none";
			document.getElementById("deleteConfirmInput").value = "";
		});
	}
}

function renderSmtpConfigs() {
	const list = document.getElementById("smtpConfigsList");
	if (!list) return;
	const configs = getSmtpConfigs();
	list.innerHTML = "";

	if (configs.length === 0) {
		list.innerHTML =
			'<div style="padding: 24px; text-align: center; color: var(--text-tertiary);">No SMTP configurations yet. Add one to start sending real emails.</div>';
		return;
	}

	configs.forEach((cfg) => {
		const card = document.createElement("div");
		card.className = "smtp-config-card";
		card.innerHTML = `
            <div class="smtp-config-header">
                <div>
                    <div class="smtp-config-name">${cfg.name}</div>
                    <div class="smtp-config-host">${cfg.smtp_host}:${cfg.smtp_port}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="status-badge ${cfg.is_active ? "active" : "paused"}">
                        <span class="material-icons-outlined">${cfg.is_active ? "check_circle" : "pause_circle"}</span>
                        ${cfg.is_active ? "Active" : "Inactive"}
                    </span>
                    <button class="icon-btn smtp-delete-btn" data-id="${cfg.id}" title="Delete">
                        <span class="material-icons-outlined" style="color: var(--red-500); font-size: 18px;">delete</span>
                    </button>
                </div>
            </div>
            <div class="smtp-config-details">
                <div class="smtp-detail"><span class="smtp-detail-label">From:</span> ${cfg.from_name ? cfg.from_name + " &lt;" + cfg.from_email + "&gt;" : cfg.from_email}</div>
                <div class="smtp-detail"><span class="smtp-detail-label">Username:</span> ${cfg.smtp_username}</div>
                <div class="smtp-detail"><span class="smtp-detail-label">Limits:</span> ${cfg.hourly_limit}/hr · ${cfg.daily_limit}/day</div>
                <div class="smtp-detail"><span class="smtp-detail-label">Added:</span> ${formatDateShort(cfg.created_at)}</div>
            </div>
        `;
		list.appendChild(card);
	});

	// Bind delete buttons
	list.querySelectorAll(".smtp-delete-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			deleteSmtpConfig(btn.dataset.id);
			showToast("SMTP configuration removed", "info");
			renderSmtpConfigs();
		});
	});
}
