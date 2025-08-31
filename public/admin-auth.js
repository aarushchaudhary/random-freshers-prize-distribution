// This script runs before the rest of the page to protect it.

// 1. Get the saved session data from the browser.
const savedSession = sessionStorage.getItem('sessionData');
let user = null;

if (savedSession) {
    // If session data exists, parse it to get the user info.
    user = JSON.parse(savedSession).user;
}

// 2. Check if the user is an admin.
// If there is NO user logged in OR if the logged-in user's role is NOT 'admin',
// then redirect them to the main login page.
if (!user || user.role !== 'admin') {
    alert('Access Denied. You must be an admin to view this page.');
    window.location.href = 'index.html';
}
