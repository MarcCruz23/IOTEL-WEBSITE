// Profile and notifications are loaded from the authenticated Express API.
(function(){
  const currentUser = JSON.parse(localStorage.getItem('IOTEL_CURRENT_USER') || '{}');

  document.addEventListener('DOMContentLoaded', async ()=>{
    const { apiRequest } = await import('./api.js');
    const nameEl = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');
    const phoneEl = document.getElementById('profilePhone');
    const bioEl = document.getElementById('profileBio');

    let profile = {};
    try { profile = (await apiRequest('/account/profile')).profile; }
    catch (error) { window.IOTEL_UI.toast(error.message, 'error'); }
    const demoName = currentUser.fullName || '';
    nameEl.value = profile.name || demoName || '';
    emailEl.value = currentUser.email || '';
    emailEl.readOnly = true;
    emailEl.title = 'Your verified sign-in address';
    phoneEl.value = profile.mobileNumber || '';
    bioEl.value = profile.bio || '';

    document.getElementById('saveProfile').addEventListener('click', async ()=>{
      const button = document.getElementById('saveProfile'); button.disabled = true;
      try {
        const { profile } = await apiRequest('/account/profile', { method: 'PUT', body: JSON.stringify({ name: nameEl.value.trim(), mobileNumber: phoneEl.value.trim(), bio: bioEl.value.trim() }) });
        localStorage.setItem('IOTEL_USER_NAME', profile.name);
        localStorage.setItem('IOTEL_CURRENT_USER', JSON.stringify({ ...currentUser, fullName: profile.name, mobileNumber: profile.mobileNumber }));
        window.IOTEL_UI.toast('Profile saved.', 'success');
        document.querySelectorAll('.user-name').forEach(el=>el.textContent = profile.name);
      } catch (error) { window.IOTEL_UI.toast(error.message, 'error'); }
      finally { button.disabled = false; }
    });

    // Handle section navigation
    const navLinks = document.querySelectorAll('.settings-nav-link');
    const sections = document.querySelectorAll('.settings-section');
    
    for(let i=0; i<navLinks.length; i++){
      navLinks[i].addEventListener('click', (e)=>{
        if (navLinks[i].getAttribute('href') !== '#') return;
        e.preventDefault();
        const sectionId = navLinks[i].getAttribute('data-section') + 'Section';
        
        // Hide all sections
        for(let j=0; j<sections.length; j++){
          sections[j].style.display = 'none';
        }
        
        // Show selected section
        const selectedSection = document.getElementById(sectionId);
        if(selectedSection) selectedSection.style.display = 'block';
        
        // Update active state
        for(let k=0; k<navLinks.length; k++){
          navLinks[k].parentElement.classList.remove('active');
        }
        navLinks[i].parentElement.classList.add('active');
      });
    }
    
    // Set profile as active on page load
    const profileLink = document.querySelector('[data-section="profile"]');
    if(profileLink) profileLink.parentElement.classList.add('active');

    document.getElementById('logoutBtn')?.addEventListener('click', ()=>{ window.logout(); });
    const notificationCard = document.querySelector('#notificationsSection .profile-card');
    try {
      const { notifications } = await apiRequest('/notifications');
      notificationCard.textContent = notifications.length ? '' : 'No notifications yet.';
      for (const notification of notifications) {
        const row = document.createElement('p'); row.textContent = `${notification.title}: ${notification.message} `;
        if (!notification.isRead) {
          const button = document.createElement('button'); button.className = 'book-btn'; button.textContent = 'Mark read';
          button.addEventListener('click', async () => {
            try { await apiRequest(`/notifications/${encodeURIComponent(notification.id)}/read`, { method: 'PUT' }); button.remove(); }
            catch (error) { window.IOTEL_UI.toast(error.message, 'error'); }
          });
          row.appendChild(button);
        }
        notificationCard.appendChild(row);
      }
    } catch (error) { notificationCard.textContent = error.message; }
  });

})();
