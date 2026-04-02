function initComposePage() {
	let csvEmails = [];
	const csvInput = document.getElementById("csvFileInput");
	const csvUploadArea = document.getElementById("csvUploadArea");
	const csvPreview = document.getElementById("csvPreview");
	const csvCount = document.getElementById("csvEmailCount");
	const csvEmailList = document.getElementById("csvEmailList");
	const csvClear = document.getElementById("csvClearBtn");

	// CSV Upload
	if (csvUploadArea) {
		csvUploadArea.addEventListener(
			"click",
			() => csvInput && csvInput.click(),
		);

		csvUploadArea.addEventListener("dragover", (e) => {
			e.preventDefault();
			csvUploadArea.classList.add("dragover");
		});
		csvUploadArea.addEventListener("dragleave", () => {
			csvUploadArea.classList.remove("dragover");
		});
		csvUploadArea.addEventListener("drop", (e) => {
			e.preventDefault();
			csvUploadArea.classList.remove("dragover");
			const file = e.dataTransfer.files[0];
			if (file) handleCSVFile(file);
		});
	}

	if (csvInput) {
		csvInput.addEventListener("change", (e) => {
			const file = e.target.files[0];
			if (file) handleCSVFile(file);
		});
	}

	function handleCSVFile(file) {
		if (!file.name.endsWith(".csv")) {
			showToast("Please upload a .csv file", "warning");
			return;
		}
		const reader = new FileReader();
		reader.onload = (e) => {
			const result = parseCSVForEmails(e.target.result);
			if (!result.success) {
				showToast(result.error, "error");
				return;
			}
			csvEmails = result.emails;
			showToast(`${csvEmails.length} email addresses loaded`, "success");
			renderCSVPreview();
		};
		reader.readAsText(file);
	}

	function renderCSVPreview() {
		if (!csvPreview || !csvCount || !csvEmailList) return;
		if (csvEmails.length === 0) {
			csvPreview.style.display = "none";
			if (csvUploadArea) csvUploadArea.style.display = "";
			return;
		}

		csvPreview.style.display = "block";
		if (csvUploadArea) csvUploadArea.style.display = "none";
		csvCount.textContent = `${csvEmails.length} recipients loaded`;
		csvEmailList.innerHTML = "";
		csvEmails.forEach((email) => {
			csvEmailList.insertAdjacentHTML(
				"beforeend",
				`<span class="recipient-chip">${email}</span>`,
			);
		});
	}

	if (csvClear) {
		csvClear.addEventListener("click", () => {
			csvEmails = [];
			if (csvInput) csvInput.value = "";
			renderCSVPreview();
			showToast("Recipients cleared", "info");
		});
	}

	// Toolbar
	document.querySelectorAll(".toolbar-btn[data-cmd]").forEach((btn) => {
		btn.addEventListener("click", () => {
			const cmd = btn.dataset.cmd;
			document.execCommand(cmd, false, null);
			btn.classList.toggle("active");
		});
	});

	// Create Campaign
	const createBtn = document.getElementById("createCampaignBtn");
	if (createBtn) {
		createBtn.addEventListener("click", () => {
			const name = document.getElementById("campaignName")?.value.trim();
			const subject = document
				.getElementById("campaignSubject")
				?.value.trim();
			const body = document
				.getElementById("campaignBody")
				?.innerHTML.trim();
			const date = document.getElementById("scheduleDate")?.value;
			const time = document.getElementById("scheduleTime")?.value;

			// Validation
			if (!name) {
				showToast("Please enter a campaign name", "warning");
				return;
			}
			if (!subject) {
				showToast("Please enter an email subject", "warning");
				return;
			}
			if (!body || body === "<br>") {
				showToast("Please enter email body content", "warning");
				return;
			}
			if (csvEmails.length === 0) {
				showToast(
					"Please upload a CSV file with recipient emails",
					"warning",
				);
				return;
			}
			if (!date) {
				showToast("Please select a schedule date", "warning");
				return;
			}
			if (!time) {
				showToast("Please select a schedule time", "warning");
				return;
			}

			const startTime = new Date(`${date}T${time}`);
			if (isNaN(startTime.getTime())) {
				showToast("Invalid date/time selected", "error");
				return;
			}

			if (startTime <= new Date()) {
				showToast("Schedule time must be in the future", "warning");
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
				hourly_limit: 100,
			});

			if (!result.success) {
				showToast(result.error || "Failed to create campaign", "error");
				return;
			}

			// Create scheduled emails
			addScheduledEmails(
				result.campaign.id,
				csvEmails,
				subject,
				body,
				startTime.toISOString(),
				5,
			);

			showToast("Campaign created successfully!", "success");
			setTimeout(() => {
				window.location.href = "dashboard.html";
			}, 800);
		});
	}
}
