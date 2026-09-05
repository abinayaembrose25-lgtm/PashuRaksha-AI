const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const searchInput = document.getElementById('searchInput');

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
  window.location.href = 'index.html';
});
