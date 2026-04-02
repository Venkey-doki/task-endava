function renderCampaignDetailsPage() {
	const urlParams = new URLSearchParams(window.location.search);
	const campId = urlParams.get("id");
	if (!campId) {
		showToast("Campaign not found", "error");
		return;
	}

	const campaign = getCampaignById(campId);
	if (!campaign) {
		showToast("Campaign not found", "error");
		return;
	}

	const emails = getEmailsByCampaign(campId);

	// Header
	const titleEl = document.getElementById("detailCampaignName");
	if (titleEl) titleEl.textContent = campaign.name;

	const statusEl = document.getElementById("detailCampaignStatus");
	if (statusEl) {
		const statusIcons = {
			active: "play_circle",
			pending: "schedule",
			paused: "pause_circle",
			completed: "check_circle",
			cancelled: "cancel",
		};
		statusEl.className = `status-badge ${campaign.status}`;
		statusEl.innerHTML = `<span class="material-icons-outlined">${statusIcons[campaign.status] || "help"}</span>${campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}`;
	}

	// Stats cards
	const setVal = (id, val) => {
		const el = document.getElementById(id);
		if (el) el.textContent = val;
	};
	setVal("statTotal", campaign.total_recipients);
	setVal("statSent", campaign.emails_sent);
	setVal("statFailed", campaign.emails_failed);
	setVal("statPending", campaign.emails_pending);

	// Progress
	const processed = campaign.emails_sent + campaign.emails_failed;
	const total = campaign.total_recipients || 1;
	const pct = Math.round((processed / total) * 100);

	const progressPct = document.getElementById("progressPct");
	if (progressPct) progressPct.textContent = `${pct}%`;
	const progressFill = document.getElementById("progressFill");
	if (progressFill) {
		setTimeout(() => {
			progressFill.style.width = `${pct}%`;
		}, 100);
	}

	// Campaign info
	setVal("infoSubject", campaign.subject);
	setVal("infoStartTime", formatDateNice(campaign.start_time));
	setVal("infoCreatedAt", formatDateNice(campaign.created_at));
	setVal(
		"infoStatus",
		campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1),
	);
	setVal("infoDelay", `${campaign.delay_between_emails_seconds || 5}s`);
	setVal("infoHourlyLimit", campaign.hourly_limit || 100);

	const bodyEl = document.getElementById("infoBody");
	if (bodyEl) bodyEl.innerHTML = campaign.body || "<em>No content</em>";

	// Email list tabs
	const allTab = document.getElementById("emailsAll");
	const sentTab = document.getElementById("emailsSent");
	const failedTab = document.getElementById("emailsFailed");
	const pendingTab = document.getElementById("emailsPending");

	function renderEmailList(container, emailList) {
		if (!container) return;
		container.innerHTML = "";
		if (emailList.length === 0) {
			container.innerHTML =
				'<div style="padding: 24px; color: var(--text-tertiary); text-align: center;">No emails in this category.</div>';
			return;
		}
		emailList.forEach((em) => {
			const badgeClass = em.status;
			const badgeIcon =
				em.status === "sent"
					? "check_circle"
					: em.status === "failed"
						? "error"
						: "schedule";
			const timeStr = em.sent_at
				? formatDateShort(em.sent_at)
				: formatDateShort(em.scheduled_time);
			const row = document.createElement("div");
			row.className = "email-row";
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
	renderEmailList(
		sentTab,
		emails.filter((e) => e.status === "sent"),
	);
	renderEmailList(
		failedTab,
		emails.filter((e) => e.status === "failed"),
	);
	renderEmailList(
		pendingTab,
		emails.filter((e) => e.status === "scheduled"),
	);

	// Tab switching
	document.querySelectorAll(".tab-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			document
				.querySelectorAll(".tab-btn")
				.forEach((b) => b.classList.remove("active"));
			document
				.querySelectorAll(".tab-content")
				.forEach((c) => c.classList.remove("active"));
			btn.classList.add("active");
			const tabId = btn.dataset.tab;
			const content = document.getElementById(tabId);
			if (content) content.classList.add("active");
		});
	});
}
