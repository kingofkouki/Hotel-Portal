/**
 * QIN Portal - Main Application Router & Controller
 * Data access is available only through authenticated Apps Script RPC calls.
 */

let portalSessionToken = '';

const themeToggle = document.getElementById('themeToggle');
const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const loginMessage = document.getElementById('loginMessage');

function setTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    themeToggle.textContent = isDark ? '☀️ Light mode' : '🌙 Dark mode';
    themeToggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
    themeToggle.setAttribute('aria-pressed', String(isDark));
}

setTheme(localStorage.getItem('hotel-portal-theme') === 'dark' ? 'dark' : 'light');
themeToggle.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('hotel-portal-theme', nextTheme);
});

function applyNavigationSettings(style, size) {
    const validStyles = ['adaptive', 'icons', 'text', 'both'];
    const validSizes = ['small', 'medium', 'large'];
    const navStyle = validStyles.includes(style) ? style : 'adaptive';
    const navSize = validSizes.includes(size) ? size : 'medium';

    document.body.dataset.navStyle = navStyle;
    document.body.dataset.navSize = navSize;
}

applyNavigationSettings(
    localStorage.getItem('hotel-portal-nav-style') || 'adaptive',
    localStorage.getItem('hotel-portal-nav-size') || 'medium'
);

function callPortalServer(methodName, args) {
    return new Promise((resolve, reject) => {
        if (!window.google || !google.script || !google.script.run) {
            reject(new Error('Portal harus dibuka melalui URL Google Apps Script Web App.'));
            return;
        }

        const runner = google.script.run
            .withSuccessHandler(resolve)
            .withFailureHandler(error => reject(new Error(error && error.message
                ? error.message
                : 'Permintaan ke server gagal.')));
        runner[methodName].apply(runner, args);
    });
}

function initializePortalAuth() {
    loginForm.addEventListener('submit', async event => {
        event.preventDefault();
        loginMessage.textContent = '';
        loginButton.disabled = true;
        loginButton.textContent = 'Memeriksa...';

        try {
            const result = await callPortalServer('authenticatePortalUser', [
                document.getElementById('loginUsername').value.trim(),
                document.getElementById('loginPassword').value
            ]);
            portalSessionToken = result.token;
            document.getElementById('signedInUser').textContent = result.username;
            document.getElementById('loginPassword').value = '';
            document.getElementById('authScreen').hidden = true;
            document.getElementById('portalShell').hidden = false;
            loadModule('shift-log', null, 'Shift Handover Log');
        } catch (error) {
            loginMessage.textContent = error.message;
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = 'Masuk';
        }
    });

    document.getElementById('logoutButton').addEventListener('click', logoutPortalUser);
}

async function logoutPortalUser() {
    const token = portalSessionToken;
    portalSessionToken = '';
    document.getElementById('portalShell').hidden = true;
    document.getElementById('authScreen').hidden = false;
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    loginMessage.textContent = '';

    if (!token) return;
    try {
        await callPortalServer('logoutPortalUser', [token]);
    } catch (error) {
        console.error('Logout failed:', error);
    }
}

initializePortalAuth();

function loadModule(moduleName, evt, titleText) {
    const buttons = document.querySelectorAll('.menu-btn');
    buttons.forEach(button => button.classList.remove('active'));
    const activeButton = evt && evt.currentTarget
        ? evt.currentTarget
        : document.querySelector(`.menu-btn[data-module="${moduleName}"]`);
    if (activeButton) activeButton.classList.add('active');

    document.getElementById('pageTitle').innerText = titleText;
    const template = document.getElementById(`module-${moduleName}`);
    if (!template) {
        throw new Error(`Template modul tidak ditemukan: ${moduleName}`);
    }
    document.getElementById('moduleContainer').replaceChildren(template.content.cloneNode(true));

    if (moduleName === 'dashboard') renderDataDashboard();
    if (moduleName === 'settings') initializeNavigationSettings();
    if (moduleName === 'room-status') initializeRoomStatusModule();
}

function fetchPortalData() {
    if (!portalSessionToken) {
        return Promise.reject(new Error('Sesi login tidak tersedia. Silakan masuk kembali.'));
    }
    return callPortalServer('getPortalData', [portalSessionToken]);
}

function fetchDashboardData() {
    return fetchPortalData().then(data => data.records);
}

function sendDataToGoogleSheet(data, formId, defaultButtonText, btnElement, onRequestComplete) {
    if (!portalSessionToken) {
        showToast('Sesi berakhir', 'Silakan masuk kembali sebelum mengirim data.', true);
        if (btnElement) {
            btnElement.innerText = defaultButtonText;
            btnElement.disabled = false;
        }
        return;
    }

    callPortalServer('savePortalData', [portalSessionToken, data])
        .then(result => {
            showToast('Berhasil Disimpan', result.message || 'Data laporan telah masuk ke Google Sheets.');
            if (formId) document.getElementById(formId).reset();
            if (btnElement) {
                btnElement.innerText = defaultButtonText;
                btnElement.disabled = false;
            }
            if (onRequestComplete) onRequestComplete();
        })
        .catch(error => {
            console.error('Data save failed:', error);
            showToast('Gagal', error.message || 'Terjadi kesalahan saat mengirim data.', true);
            if (btnElement) {
                btnElement.innerText = defaultButtonText;
                btnElement.disabled = false;
            }
            if (onRequestComplete) onRequestComplete();
        });
}

function showToast(title, message, isError = false) {
    const toast = document.getElementById('toastNotification');
    document.getElementById('toastTitle').innerText = title;
    document.getElementById('toastMessage').innerText = message;
    toast.style.borderLeft = isError ? '4px solid #ff3b30' : '4px solid #34c759';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}
