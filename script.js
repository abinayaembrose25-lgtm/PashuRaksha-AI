const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const searchInput = document.getElementById('searchInput');
const dashboard = document.querySelector('.app-shell');
const storedFarmerName = localStorage.getItem('pashuFarmerName');

if (dashboard && !storedFarmerName) {
  window.location.replace('login.html');
}

if (dashboard && storedFarmerName) {
  const profileName = document.getElementById('profileName');
  const profileAvatar = document.getElementById('profileAvatar');
  const welcomeName = document.getElementById('welcomeName');
  const initials = storedFarmerName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  if (profileName) profileName.textContent = storedFarmerName;
  if (profileAvatar) profileAvatar.textContent = initials;
  if (welcomeName) welcomeName.textContent = storedFarmerName.split(' ')[0];
}

if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });
}

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    if (window.innerWidth <= 760) sidebar.classList.remove('open');
  });
});

if (searchInput) {
  searchInput.addEventListener('input', (event) => {
    const query = event.target.value.toLowerCase().trim();
    document.querySelectorAll('#reportRows tr').forEach((row) => {
      row.hidden = query && !row.textContent.toLowerCase().includes(query);
    });
  });
}

document.querySelector('.notification-button')?.addEventListener('click', () => {
  alert('You have 3 new disease alerts.');
});

const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');
const demoButton = document.querySelector('.demo-button');

togglePassword?.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePassword.textContent = isPassword ? 'Hide' : 'Show';
  togglePassword.setAttribute('aria-label', `${isPassword ? 'Hide' : 'Show'} password`);
});

loginForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  loginStatus.textContent = '';
  if (!loginForm.checkValidity()) {
    loginStatus.textContent = 'Please enter a valid email and password.';
    loginForm.reportValidity();
    return;
  }
  const emailName = document.getElementById('email').value.split('@')[0];
  const displayName = emailName.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  localStorage.setItem('pashuFarmerName', displayName || 'Farmer');
  window.location.href = 'index.html';
});

demoButton?.addEventListener('click', () => {
  localStorage.setItem('pashuFarmerName', 'Demo Farmer');
});
