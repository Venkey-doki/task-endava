// ========== DARK / LIGHT THEME TOGGLE ==========
// Persists theme preference in localStorage

(function() {
    const THEME_KEY = 'velo_theme';

    function getTheme() {
        return localStorage.getItem(THEME_KEY) || 'light';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        // Update all toggle switches on the page
        document.querySelectorAll('.theme-toggle-input').forEach(toggle => {
            toggle.checked = theme === 'dark';
        });
    }

    function toggleTheme() {
        const current = getTheme();
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem(THEME_KEY, next);
        applyTheme(next);
    }

    // Apply theme immediately (before DOMContentLoaded) to prevent flash
    applyTheme(getTheme());

    // Expose globally
    window.veloToggleTheme = toggleTheme;
    window.veloGetTheme = getTheme;

    // Bind toggle switches after DOM loads
    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(getTheme());
        document.querySelectorAll('.theme-toggle-input').forEach(toggle => {
            toggle.addEventListener('change', toggleTheme);
        });
    });
})();
