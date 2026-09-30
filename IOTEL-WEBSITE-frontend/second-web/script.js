const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.main-nav');
const today = document.querySelector('#today');

if (navToggle && nav) {
  navToggle.addEventListener('click', () => {
    nav.classList.toggle('open');
  });
}

if (today) {
  const date = new Date();
  today.textContent = date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
