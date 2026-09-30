// Shared, non-blocking feedback UI. It replaces the browser's plain alerts,
// confirms and prompts with a consistent IOTEL look.
(function createIotelUi(){
  function mount(){
    let root = document.getElementById('iotelUi');
    if(root) return root;
    root = document.createElement('div'); root.id = 'iotelUi';
    root.innerHTML = '<div class="iotel-toasts" aria-live="polite"></div><div class="iotel-dialog-backdrop" hidden><section class="iotel-dialog" role="dialog" aria-modal="true"><p class="iotel-dialog-kicker">IOTEL</p><h2></h2><p class="iotel-dialog-message"></p><label class="iotel-dialog-field" hidden><span></span><input></label><div class="iotel-dialog-actions"><button type="button" class="iotel-dialog-cancel">Cancel</button><button type="button" class="iotel-dialog-confirm">Continue</button></div></section></div>';
    const style = document.createElement('style');
    style.textContent = '.iotel-toasts{position:fixed;right:22px;bottom:22px;z-index:10050;display:grid;gap:10px;max-width:min(390px,calc(100vw - 36px))}.iotel-toast{display:flex;gap:10px;align-items:flex-start;background:#0f172a;color:#fff;padding:14px 16px;border-radius:12px;box-shadow:0 16px 35px rgba(15,23,42,.26);font:600 14px/1.4 Inter,system-ui,sans-serif;animation:iotelIn .18s ease-out}.iotel-toast.success{border-left:4px solid #22c55e}.iotel-toast.error{border-left:4px solid #ef4444}.iotel-toast.info{border-left:4px solid #38bdf8}.iotel-toast button{margin-left:auto;border:0;background:transparent;color:#cbd5e1;font-size:18px;line-height:1;cursor:pointer}.iotel-dialog-backdrop{position:fixed;inset:0;z-index:10060;display:grid;place-items:center;padding:20px;background:rgba(15,23,42,.58);backdrop-filter:blur(3px)}.iotel-dialog{width:min(440px,100%);box-sizing:border-box;background:#fff;border-radius:16px;padding:25px;box-shadow:0 24px 65px rgba(15,23,42,.35);font-family:Inter,system-ui,sans-serif;color:#172033}.iotel-dialog-kicker{margin:0 0 7px;color:#2563eb;font-size:11px;font-weight:800;letter-spacing:.12em}.iotel-dialog h2{margin:0;font-size:20px}.iotel-dialog-message{margin:10px 0 0;color:#64748b;line-height:1.5}.iotel-dialog-field{display:block;margin-top:18px;color:#334155;font-size:13px;font-weight:700}.iotel-dialog-field input{width:100%;box-sizing:border-box;margin-top:7px;padding:11px 12px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}.iotel-dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}.iotel-dialog-actions button{border:0;border-radius:8px;padding:10px 15px;font:700 14px Inter,system-ui,sans-serif;cursor:pointer}.iotel-dialog-cancel{background:#e2e8f0;color:#334155}.iotel-dialog-confirm{background:#2563eb;color:#fff}.iotel-dialog-confirm.danger{background:#dc2626}@keyframes iotelIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}';
    // Component display rules must never override the native hidden attribute.
    style.textContent += '#iotelUi [hidden]{display:none!important}';
    document.head.appendChild(style); document.body.appendChild(root); return root;
  }
  function toast(message, type='info'){
    const root = mount(); const item = document.createElement('div'); item.className = `iotel-toast ${type}`;
    const text = document.createElement('span'); text.textContent = message;
    const close = document.createElement('button'); close.type='button'; close.setAttribute('aria-label','Dismiss'); close.textContent='×';
    close.addEventListener('click', ()=>item.remove()); item.append(text, close); root.querySelector('.iotel-toasts').appendChild(item); setTimeout(()=>item.remove(), 4500);
  }
  function dialog({title, message, inputLabel, initialValue='', confirmLabel='Continue', danger=false}){
    const root = mount(), backdrop = root.querySelector('.iotel-dialog-backdrop'), heading = root.querySelector('h2'), body = root.querySelector('.iotel-dialog-message'), field = root.querySelector('.iotel-dialog-field'), input = field.querySelector('input'), confirm = root.querySelector('.iotel-dialog-confirm'), cancel = root.querySelector('.iotel-dialog-cancel');
    heading.textContent=title; body.textContent=message || ''; field.hidden=!inputLabel; field.querySelector('span').textContent=inputLabel || ''; input.value=initialValue; confirm.textContent=confirmLabel; confirm.classList.toggle('danger',danger); backdrop.hidden=false;
    return new Promise((resolve)=>{
      const finish=(value)=>{backdrop.hidden=true; confirm.removeEventListener('click', yes); cancel.removeEventListener('click', no); backdrop.removeEventListener('click', outside); input.removeEventListener('keydown', keydown); resolve(value)};
      const yes=()=>finish(inputLabel ? input.value.trim() : true), no=()=>finish(inputLabel ? null : false), outside=(event)=>{if(event.target===backdrop) no()}, keydown=(event)=>{if(event.key==='Escape') no(); if(event.key==='Enter' && inputLabel) yes()};
      confirm.addEventListener('click',yes); cancel.addEventListener('click',no); backdrop.addEventListener('click',outside); input.addEventListener('keydown',keydown); if(inputLabel) setTimeout(()=>input.focus(),0); else confirm.focus();
    });
  }
  window.IOTEL_UI = { toast, confirm: (message, options={}) => dialog({title:options.title || 'Please confirm',message,confirmLabel:options.confirmLabel || 'Confirm',danger:options.danger !== false}), prompt: (message, options={}) => dialog({title:options.title || 'Additional information',message,inputLabel:options.label || 'Enter details',initialValue:options.initialValue || '',confirmLabel:options.confirmLabel || 'Continue'}) };
})();

// site-wide JS for Stage 1: nav toggles, active link highlighting, simple dropdowns
(function(){
  function qs(sel, root=document){return root.querySelector(sel)}
  function qsa(sel, root=document){return Array.from(root.querySelectorAll(sel))}

  // Active link highlighting
  function markActiveLinks(){
    const path = location.pathname.split('/').pop() || 'index.html'
    const navLinks = document.querySelectorAll('.header-nav .nav-link')
    for(let i=0;i<navLinks.length;i++){ const a = navLinks[i]; const href = a.getAttribute('href') || ''; if(href.endsWith(path) || (path==='index.html' && href.endsWith('catalog.html'))){ a.classList.add('active-link') } else a.classList.remove('active-link') }
  }

  // Hamburger / drawer
  const hamburger = qs('#hamburgerBtn')
  const drawer = qs('#drawerMenu')
  if(hamburger && drawer){
    hamburger.addEventListener('click', ()=>{
      drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none'
    })
  }

  // User menu dropdown
  const userBtn = qs('#userMenuBtn')
  const userDropdown = qs('#userMenuDropdown')
  if(userBtn && userDropdown){
    userBtn.addEventListener('click', ()=>{
      userDropdown.style.display = userDropdown.style.display === 'none' ? 'block' : 'none'
    })
    document.addEventListener('click', (e)=>{
      if(!userBtn.contains(e.target) && !userDropdown.contains(e.target)) userDropdown.style.display='none'
    })
  }

  // Profile menu dropdown (new customer header)
  const profileBtn = qs('#profileMenuBtn')
  const profileDropdown = qs('#profileDropdown')
  if(profileBtn && profileDropdown){
    profileBtn.addEventListener('click', (e)=>{
      e.stopPropagation()
      profileDropdown.style.display = profileDropdown.style.display === 'none' ? 'block' : 'none'
    })
    document.addEventListener('click', (e)=>{
      if(!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) profileDropdown.style.display='none'
    })
  }

  // Logout function used across the UI
  window.logout = async function(){
    localStorage.removeItem('IOTEL_CURRENT_USER')
    localStorage.removeItem('IOTEL_USER_ROLE')
    localStorage.removeItem('IOTEL_USER_NAME')
    sessionStorage.removeItem('IOTEL_AUTH_TOKEN')
    const { clearToken } = await import('/static/js/api.js');
    await clearToken();
    location.href = '/login.html'
  }

  // Populate user name if available
  function populateUser(){
    const name = localStorage.getItem('IOTEL_USER_NAME')
    const userNameEls = document.querySelectorAll('.user-name')
    for(let i=0;i<userNameEls.length;i++){ if(name) userNameEls[i].textContent = name }
  }

  // On load
  document.addEventListener('DOMContentLoaded', ()=>{
    markActiveLinks()
    populateUser()
    const publicCatalogLink = qs('.public-catalog-link')
    const publicCatalogModal = qs('#publicCatalogModal')
    if(publicCatalogLink && publicCatalogModal){
      const modalCard = publicCatalogModal.querySelector('.login-feedback-card')
      const closePublicCatalogModal = () => { publicCatalogModal.hidden = true }
      publicCatalogLink.addEventListener('click', (event)=>{
        event.preventDefault()
        publicCatalogModal.hidden = false
        modalCard.focus()
      })
      publicCatalogModal.addEventListener('click', (event)=>{
        if(event.target === publicCatalogModal) closePublicCatalogModal()
      })
    }
    // Load chatbot widget (demo)
    try{
      const s = document.createElement('script'); s.src = '/static/js/chatbot.js'; s.defer = true; document.body.appendChild(s);
    }catch(e){/* ignore */}
    // Update cart count across headers
    function updateCartCount(){ const cart = JSON.parse(localStorage.getItem('IOTEL_CART')||'[]'); const count = cart.reduce((s,i)=>s+(i.qty||0),0); const cc = document.querySelectorAll('.cart-count'); for(let i=0;i<cc.length;i++) cc[i].textContent = count; const cib = document.querySelectorAll('.cart-icon-btn'); for(let j=0;j<cib.length;j++) cib[j].textContent = '🛒 ' + count }
    updateCartCount()
    window.updateCartCount = updateCartCount
    // Handle logout from profile dropdown
    const logoutBtn2 = qs('#headerLogoutBtn2')
    if(logoutBtn2){
      logoutBtn2.addEventListener('click', window.logout)
    }
    // Role selection buttons on the login page (use safe selection)
    const roleBtns = document.querySelectorAll('.role-btn')
    // Set default active state on customer role
    if(roleBtns.length > 0){
      const customerBtn = Array.from(roleBtns).find(b=>b.getAttribute('data-role')==='customer')
      if(customerBtn) customerBtn.classList.add('active')
    }
    for(let i=0;i<roleBtns.length;i++){
      const btn = roleBtns[i]
      btn.addEventListener('click', ()=>{
        const r = btn.getAttribute('data-role')
        const sel = qs('#selectedRole')
        if(sel) sel.value = r
        const all = document.querySelectorAll('.role-btn')
        for(let k=0;k<all.length;k++) all[k].classList.remove('active')
        btn.classList.add('active')
      })
    }
    // Convert any sign-out links to use the logout function (safe selection)
    const signouts = document.querySelectorAll('a[href$="login.html"]:not(.public-login-link)')
    for(let i=0;i<signouts.length;i++){ signouts[i].addEventListener('click', (e)=>{ e.preventDefault(); window.logout(); }) }
    function normalizeRole(value){
      const normalized = String(value || '').toLowerCase()
      return ['customer', 'staff', 'admin'].includes(normalized) ? normalized : null
    }

    function redirectForRole(role){
      return role==='admin' ? '/admin/dashboard.html' : (role==='staff' ? '/staff/dashboard.html' : '/catalog.html')
    }

    function showAccessDenied(role){
      const msg = document.createElement('div')
      msg.style.position='fixed'; msg.style.left='0'; msg.style.top='0'; msg.style.right='0'; msg.style.bottom='0'; msg.style.display='flex'; msg.style.alignItems='center'; msg.style.justifyContent='center'; msg.style.background='rgba(0,0,0,0.5)'; msg.style.zIndex='9999'
      msg.innerHTML = `<div style="background:#fff;padding:24px;border-radius:8px;max-width:420px;text-align:center"><h2>Access Denied</h2><p>You are signed in as <strong>${role}</strong> and cannot access this page.</p><div style="display:flex;gap:8px;justify-content:center;margin-top:12px"><button id="backToHome" class="hero-btn primary">Go To My Home</button><button id="doLogout" class="hero-btn secondary">Logout</button></div></div>`
      document.body.appendChild(msg)
      document.getElementById('backToHome').addEventListener('click', ()=>{ location.href = redirectForRole(role) })
      document.getElementById('doLogout').addEventListener('click', ()=>{ window.logout() })
    }

    // The login endpoint provides the role; protected backend APIs verify the token again.
    (async function roleGuard(){
      const path = location.pathname || '/'
      let required = null
      if(path.includes('/admin/')) required = 'admin'
      else if(path.includes('/staff/')) required = 'staff'
      else {
        const customerPages = ['catalog.html','cart.html','checkout.html','orders.html','messages.html','services.html','addresses.html','settings.html','order-confirmation.html','order-tracking.html']
        const page = path.split('/').pop()
        if(customerPages.includes(page)) required = 'customer'
      }

      const isLoginPage = path==='/' || path.endsWith('/index.html') || path.endsWith('/login.html')
      if(isLoginPage && document.getElementById('loginForm')) return
      if(isLoginPage && !required && !document.getElementById('loginForm')) return
      if(!required && !isLoginPage) return

      let role = normalizeRole(localStorage.getItem('IOTEL_USER_ROLE'))
      const token = sessionStorage.getItem('IOTEL_AUTH_TOKEN')
      if(!role || !token){
        if(required) location.href = '/'
        return
      }
      try {
        const { apiRequest } = await import('/static/js/api.js');
        const { user } = await apiRequest('/auth/me');
        role = normalizeRole(user.role);
        localStorage.setItem('IOTEL_USER_ROLE', role || '');
      } catch (error) {
        console.warn('Page access check failed:', error.message);
        window.IOTEL_UI.toast(error.message, 'error');
        if (error.status === 401 || error.status === 403 || !sessionStorage.getItem('IOTEL_AUTH_TOKEN')) {
          location.href = '/login.html';
        }
        return;
      }
      if(isLoginPage){
        location.href = redirectForRole(role)
      }else if(role !== required){
        showAccessDenied(role)
      }
    })()
  })
})();
