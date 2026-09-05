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
