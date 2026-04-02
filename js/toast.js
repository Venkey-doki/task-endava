// ========== TOAST NOTIFICATION SYSTEM ==========
// Custom toast notifications to replace browser alert()

(function() {
    // Create toast container on DOM load
    function createToastContainer() {
        if (document.getElementById('velo-toast-container')) return;
        const container = document.createElement('div');
        container.id = 'velo-toast-container';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }

    // Ensure container exists
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createToastContainer);
    } else {
        createToastContainer();
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - 'success' | 'error' | 'info' | 'warning'
     * @param {number} duration - Duration in ms (default 3000)
     */
    window.showToast = function(message, type = 'info', duration = 3000) {
        createToastContainer();
        const container = document.getElementById('velo-toast-container');

        const toast = document.createElement('div');
        toast.className = `velo-toast velo-toast-${type}`;

        const icons = {
            success: 'check_circle',
            error: 'error',
            warning: 'warning',
            info: 'info'
        };

        toast.innerHTML = `
            <span class="material-icons-outlined velo-toast-icon">${icons[type] || 'info'}</span>
            <span class="velo-toast-message">${message}</span>
            <button class="velo-toast-close" aria-label="Dismiss">
                <span class="material-icons-outlined">close</span>
            </button>
        `;

        // Close button
        toast.querySelector('.velo-toast-close').addEventListener('click', () => {
            dismissToast(toast);
        });

        container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('velo-toast-show');
        });

        // Auto dismiss
        if (duration > 0) {
            setTimeout(() => {
                dismissToast(toast);
            }, duration);
        }

        return toast;
    };

    function dismissToast(toast) {
        if (!toast || toast.classList.contains('velo-toast-hiding')) return;
        toast.classList.add('velo-toast-hiding');
        toast.classList.remove('velo-toast-show');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 350);
    }
})();
