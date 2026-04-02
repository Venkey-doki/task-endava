function renderDashboard() {
	const campaigns = getCampaigns();
	const grid = document.getElementById("campaignsGrid");
	if (!grid) return;

	grid.innerHTML = "";

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
			active: "play_circle",
			pending: "schedule",
			paused: "pause_circle",
			completed: "check_circle",
			cancelled: "cancel",
		};
		const icon = statusIcons[camp.status] || "help_outline";
		const label =
			camp.status.charAt(0).toUpperCase() + camp.status.slice(1);

		const card = document.createElement("div");
		card.className = "campaign-card animate-in";
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
                    <span class="metric-label" style="color: ${camp.emails_failed > 0 ? "var(--red-500)" : ""}">Failed</span>
                    <span class="metric-val" style="color: ${camp.emails_failed > 0 ? "var(--red-500)" : ""}">${camp.emails_failed}</span>
                </div>
                <div class="metric-box">
                    <span class="metric-label">Pending</span>
                    <span class="metric-val" style="color: ${camp.emails_pending > 0 ? "var(--orange-500)" : ""}">${camp.emails_pending.toLocaleString()}</span>
                </div>
            </div>
        `;
		grid.appendChild(card);
	});
}
