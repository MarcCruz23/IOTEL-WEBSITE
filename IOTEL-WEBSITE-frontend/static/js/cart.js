// Cart page JS: reads IOTEL_CART from localStorage and renders cart
(function () {
  const CART_KEY = 'IOTEL_CART';
  const FREE_SHIPPING_THRESHOLD = 5000;
  const SHIPPING_FEE = 250;

  function readCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function writeCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
  }

  function updateCartCount() {
    if (window.updateCartCount) { window.updateCartCount(); return; }
    const cart = readCart();
    const count = cart.reduce((s,i)=>s+i.qty,0);
    document.querySelectorAll('.cart-count').forEach(el=>el.textContent = String(count));
  }

  function money(v){ return '₱' + Number(v).toLocaleString('en-PH'); }

  function render() {
    const cart = readCart();
    const layout = document.getElementById('cartLayout');
    const empty = document.getElementById('emptyCart');
    const itemsList = document.getElementById('itemsList');
    const subtotalText = document.getElementById('subtotalText');
    const shippingText = document.getElementById('shippingText');
    const totalText = document.getElementById('totalText');
    const freeNotice = document.getElementById('freeShippingNotice');

    if (!cart || cart.length === 0) {
      layout.style.display = 'none';
      empty.style.display = 'block';
      updateCartCount();
      return;
    }

    layout.style.display = 'grid';
    empty.style.display = 'none';
    itemsList.innerHTML = '';

    let subtotal = 0;
    cart.forEach(item => {
      subtotal += item.price * item.qty;
      const row = document.createElement('div');
      row.className = 'cart-item';

      function norm(u){ if(typeof u !== 'string' || !u.trim()) return '/public/images/placeholder.png'; if (/^https?:\/\//i.test(u)) return u; if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return '/public/images/placeholder.png'; return u.startsWith('/') ? u : '/' + u; }
      const img = document.createElement('img'); img.className='item-img'; img.src = norm(item.imageUrl || '/public/images/placeholder.png');

      const info = document.createElement('div'); info.className = 'item-info';
      const name = document.createElement('div'); name.className='item-name'; name.textContent = item.name;
      const price = document.createElement('div'); price.className='item-price'; price.textContent = money(item.price);
      info.appendChild(name); info.appendChild(price);

      const qtyWrap = document.createElement('div'); qtyWrap.className='item-qty';
      const dec = document.createElement('button'); dec.textContent='−'; dec.title='Decrease';
      const val = document.createElement('div'); val.className='qty-val'; val.textContent = String(item.qty);
      const inc = document.createElement('button'); inc.textContent='+'; inc.title='Increase';
      qtyWrap.appendChild(dec); qtyWrap.appendChild(val); qtyWrap.appendChild(inc);

      const total = document.createElement('div'); total.className='item-total'; total.textContent = money(item.price * item.qty);

      const del = document.createElement('button'); del.textContent='Remove'; del.style.marginLeft='8px'; del.onclick = ()=>{
        const newCart = readCart().filter(i=>i.productId !== item.productId);
        writeCart(newCart);
        render();
      };

      dec.onclick = ()=>{
        const c = readCart();
        const it = c.find(i=>i.productId===item.productId);
        if(!it) return;
        if(it.qty>1){ it.qty--; writeCart(c); render(); }
      };
      inc.onclick = ()=>{
        const c = readCart();
        const it = c.find(i=>i.productId===item.productId);
        if(!it) return;
        it.qty++; writeCart(c); render();
      };

      row.appendChild(img);
      row.appendChild(info);
      row.appendChild(qtyWrap);
      row.appendChild(total);
      row.appendChild(del);

      itemsList.appendChild(row);
    });

    const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    subtotalText.textContent = money(subtotal);
    shippingText.textContent = shipping === 0 ? 'FREE' : money(shipping);
    totalText.textContent = money(subtotal + shipping);

    if(subtotal >= FREE_SHIPPING_THRESHOLD){
      freeNotice.innerHTML = '<div class="mb-4"><strong class="free-tag">You qualify for free shipping!</strong></div>';
    } else {
      freeNotice.innerHTML = '';
    }

    updateCartCount();
  }

  document.addEventListener('DOMContentLoaded', function () {
    const clearBtn = document.getElementById('clearCartBtn');
    if (clearBtn) clearBtn.addEventListener('click', async ()=>{
      if(await window.IOTEL_UI.confirm('Remove every item from your cart?', { title:'Clear cart', confirmLabel:'Clear cart', danger:true })){ writeCart([]); render(); window.IOTEL_UI.toast('Your cart is now empty.', 'success'); }
    });
    render();
  });
})();
