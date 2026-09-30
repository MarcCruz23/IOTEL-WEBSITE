// Catalog rendering and interactions for Stage 2
(function(){
  const FALLBACK_PRODUCTS = (window.MOCK && window.MOCK.products) || []
  let PRODUCTS = FALLBACK_PRODUCTS
  const container = document.getElementById('productGrid')
  const resultsCount = document.getElementById('resultsCount')
  const categoriesEl = document.getElementById('categoryTabs')
  const searchInput = document.getElementById('searchInput')
  const sortSelect = document.getElementById('sortSelect')

  let state = {
    category: 'All',
    query: '',
    sort: 'featured',
    selectedProduct: null,
    selectedImageIndex: 0,
    liked: {}
  }

  function uniqueCategories(){
    const cats = new Set(PRODUCTS.map(p=>p.category))
    return ['All', ...cats]
  }

  function formatPrice(n){ return '₱' + n.toLocaleString() }

  function renderCategories(){
    const cats = uniqueCategories()
    categoriesEl.innerHTML = ''
    cats.forEach(cat=>{
      const btn = document.createElement('button')
      btn.className = 'cat-tab' + (state.category===cat ? ' active' : '')
      btn.textContent = cat
      btn.addEventListener('click', ()=>{ state.category = cat; render(); })
      categoriesEl.appendChild(btn)
    })
  }

  function filterAndSort(){
    let items = PRODUCTS.slice()
    if(state.category !== 'All') items = items.filter(p=>p.category===state.category)
    if(state.query) items = items.filter(p=>p.name.toLowerCase().includes(state.query.toLowerCase()))
    switch(state.sort){
      case 'price-asc': items.sort((a,b)=>a.price-b.price); break;
      case 'price-desc': items.sort((a,b)=>b.price-a.price); break;
      case 'name-asc': items.sort((a,b)=>a.name.localeCompare(b.name)); break;
      default: break;
    }
    return items
  }

  function renderProducts(){
    const items = filterAndSort()
    resultsCount.textContent = items.length + ' products found'
    container.innerHTML = ''
    if(items.length===0){ container.innerHTML = '<p>No products found</p>'; return }
    items.forEach(product=>{
      // Product content is data, not markup, even when entered by an administrator.
      const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
      product = { ...product, id: escape(product.id), name: escape(product.name), category: escape(product.category), description: escape(product.description), imageUrl: escape(product.imageUrl), variations: (product.variations || []).map(escape) };
      const card = document.createElement('div')
      card.className = 'product-card'

      card.innerHTML = `
        <div class="product-img-wrap clickable" data-id="${product.id}">
          <img src="${product.imageUrl}" alt="${product.name}" class="product-img" />
          ${product.inStock?'' : '<div class="out-of-stock-overlay">Out of Stock</div>'}
          <div class="stock-badge">${product.inStock? 'In Stock' : 'Out of Stock'}</div>
        </div>
        <div class="card-header">
          <div class="cat-badge">${product.category}</div>
          <div class="card-actions">
            <button class="action-icon like-btn" data-id="${product.id}">❤</button>
            <button class="action-icon share-btn" data-id="${product.id}">↗</button>
          </div>
        </div>
        <h3 class="product-name">${product.name}</h3>
        <div class="variation-summary">${product.variations && product.variations.length? product.variations[0] : ''} ${product.variations && product.variations.length>1 ? '<span class="more-variations">+'+(product.variations.length-1)+' more</span>':''}</div>
        <p class="product-desc">${product.description}</p>
        <div class="product-footer">
          <div>
            <span class="product-price">${formatPrice(product.price)}</span>
            ${product.inStock? '<span class="stock-count">'+product.stock+' left</span>' : ''}
          </div>
          <button class="add-btn" data-id="${product.id}" ${product.inStock?'' : 'disabled'}>${product.inStock? 'Add to Cart' : 'Out of Stock'}</button>
        </div>
      `

      container.appendChild(card)
    })
  }

  function render(){
    renderCategories()
    renderProducts()
  }

  // Events
  document.addEventListener('click', (e)=>{
    const like = e.target.closest('.like-btn')
    if(like){ const id = like.dataset.id; state.liked[id]=!state.liked[id]; like.classList.toggle('liked'); return }
    const share = e.target.closest('.share-btn')
    if(share){ const id=share.dataset.id; const p=PRODUCTS.find(x=>String(x.id)===String(id)); navigator.clipboard?.writeText(p.name+' - '+formatPrice(p.price)); window.IOTEL_UI.toast('Product details copied to clipboard.', 'success'); return }
    const imgWrap = e.target.closest('.product-img-wrap')
    if(imgWrap){ const id=imgWrap.dataset.id; openDetails(id); return }
    const add = e.target.closest('.add-btn')
    if(add){ const id=add.dataset.id; addToCart(id); return }
  })

  function openDetails(id){
    const p = PRODUCTS.find(x=>String(x.id)===String(id))
    if(!p) return
    state.selectedProduct = p
    state.selectedImageIndex = 0
    showDetailOverlay(p)
  }

  function showDetailOverlay(p){
    const overlay = document.getElementById('detailOverlay')
    const detailImage = document.getElementById('detailImage')
    const detailTitle = document.getElementById('detailTitle')
    const detailPrice = document.getElementById('detailPrice')
    const detailDesc = document.getElementById('detailDesc')
    const variationList = document.getElementById('variationList')
    detailImage.src = p.images && p.images.length? p.images[0] : p.imageUrl
    detailTitle.textContent = p.name
    detailPrice.textContent = formatPrice(p.price)
    detailDesc.textContent = p.description
    variationList.innerHTML = ''
    if(p.variations && p.variations.length){
      p.variations.forEach(opt=>{
        const b = document.createElement('button')
        b.className='variation-option'
        b.textContent = opt
        b.addEventListener('click', ()=>{ /* select variation visual */ b.classList.toggle('selected-option') })
        variationList.appendChild(b)
      })
    }
    const detailAddButton = document.getElementById('detailAddBtn')
    detailAddButton.disabled = !p.inStock
    detailAddButton.textContent = p.inStock ? 'Add to Cart' : 'Out of Stock'
    detailAddButton.onclick = () => {
      if (!p.inStock) return
      addToCart(p.id)
      closeDetails()
    }
    overlay.style.display='flex'
  }

  function closeDetails(){ document.getElementById('detailOverlay').style.display='none' }

  function addToCart(id){
    const p = PRODUCTS.find(x=>String(x.id)===String(id))
    const cart = JSON.parse(localStorage.getItem('IOTEL_CART')||'[]')
    const existing = cart.find(i=>String(i.productId)===String(id))
    if (!p || !p.inStock || (existing?.qty || 0) >= p.stock) {
      window.IOTEL_UI.toast('There is not enough stock for this quantity.', 'error');
      return;
    }
    if(existing) existing.qty++
    else cart.push({ productId: id, name: p.name, price: p.price, qty: 1, imageUrl: p.imageUrl })
    localStorage.setItem('IOTEL_CART', JSON.stringify(cart))
    window.IOTEL_UI.toast(p.name + ' added to cart.', 'success')
    updateCartCount()
    if (window.updateCartCount) window.updateCartCount()
  }

  function updateCartCount(){ const cart = JSON.parse(localStorage.getItem('IOTEL_CART')||'[]'); document.querySelectorAll('.cart-count').forEach(el=>el.textContent = cart.reduce((s,i)=>s+i.qty,0)) }

  // Wire inputs
  if(searchInput){ searchInput.addEventListener('input', (e)=>{ state.query = e.target.value; renderProducts() }) }
  if(sortSelect){ sortSelect.addEventListener('change', (e)=>{ state.sort = e.target.value; renderProducts() }) }

  // Close detail
  document.addEventListener('click', (e)=>{ if(e.target.id==='detailClose') closeDetails() })

  // Init
  async function loadBackendProducts(){
    try {
      const { apiRequest } = await import('./api.js');
      const data = await apiRequest('/products', { authenticated: false });
      if (!Array.isArray(data.products)) throw new Error('Invalid product response');
      PRODUCTS = data.products.map(product => ({
        ...product,
        imageUrl: product.imageUrl || product.image || '/public/images/motorola.png',
        images: product.images || [product.imageUrl || product.image || '/public/images/motorola.png'],
        variations: product.variations || [],
        inStock: Number(product.stock) > 0
      }));
    } catch (error) {
      // Keep the requested fallback visible, but do not sell unconfirmed demo stock.
      PRODUCTS = FALLBACK_PRODUCTS.map(product => ({ ...product, inStock: false }));
      window.IOTEL_UI.toast('Live catalog unavailable. Showing sample products; ordering is temporarily disabled.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{ await loadBackendProducts(); render(); updateCartCount() })
  window.catalogRender = render
  window.closeDetails = closeDetails
})();
