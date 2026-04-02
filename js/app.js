document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    // Run simulation on every page load
    simulateCampaignProgress();

    // DASHBOARD PAGE
    if (path.includes('dashboard')) {
        renderDashboard();
    }

    // CAMPAIGN DETAILS PAGE
    if (path.includes('campaign-details')) {
        renderCampaignDetailsPage();
    }

    // COMPOSE PAGE
    if (path.includes('compose')) {
        initComposePage();
    }

    // PROFILE PAGE
    if (path.includes('profile')) {
        initProfilePage();
    }
});