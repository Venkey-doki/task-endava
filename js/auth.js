document.addEventListener('DOMContentLoaded', () => {

    // LOGIN FORM
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const pass = document.getElementById('loginPassword').value;

            if (!email || !pass) {
                showToast('Please fill in all fields', 'warning');
                return;
            }

            const result = await validateLogin(email, pass);
            if (result.success) {
                setSession(result.user);
                showToast(`Welcome back, ${result.user.name}!`, 'success');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 600);
            } else {
                showToast(result.error, 'error');
            }
        });
    }

    // SIGNUP FORM
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signupName').value.trim();
            const email = document.getElementById('signupEmail').value.trim();
            const pass = document.getElementById('signupPassword').value;

            if (!name || !email || !pass) {
                showToast('All fields are required', 'warning');
                return;
            }

            if (pass.length < 4) {
                showToast('Password must be at least 4 characters', 'warning');
                return;
            }

            const result = await addUser({ name, email, password: pass });
            if (result.success) {
                // Auto-login after signup
                setSession(result.user);
                showToast(`Account created! Welcome, ${result.user.name}!`, 'success');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 600);
            } else {
                showToast(result.error, 'error');
            }
        });
    }

    // AUTH GUARD — Check sessionStorage
    const currentPath = window.location.pathname.toLowerCase();
    const isAuthPage = currentPath.includes('login') || currentPath.includes('signup');
    const isLandingPage = currentPath.endsWith('index.html') || currentPath.endsWith('/') || currentPath === '';

    const session = getSession();

    if (!session && !isAuthPage && !isLandingPage) {
        // Not authenticated, redirect to login
        window.location.href = 'login.html';
    } else if (session && isAuthPage) {
        // Already authenticated, send to dashboard
        window.location.href = 'dashboard.html';
    }

    // UPDATE USER INFO IN UI
    if (session) {
        document.querySelectorAll('.auth-user-name').forEach(el => {
            el.textContent = session.name;
        });
        document.querySelectorAll('.auth-user-email').forEach(el => {
            el.textContent = session.email;
        });
    }

    // LOGOUT LOGIC
    document.querySelectorAll('.btn-logout').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            clearSession();
            showToast('Logged out successfully', 'info');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 500);
        });
    });
});
