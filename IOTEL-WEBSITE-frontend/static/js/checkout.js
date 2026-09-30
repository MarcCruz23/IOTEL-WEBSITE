import { apiRequest } from './api.js';

// Checkout page with payment modal, address selection, and order creation
(function(){
  const CART_KEY = 'IOTEL_CART';
  const FREE_SHIPPING_THRESHOLD = 5000;
  const SHIPPING_FEE = 250;

  // State
  let state = {
    selectedAddress: null,
    selectedPaymentMethod: null,
    paymentReference: '',
    cart: [],
    addresses: []
  };
  let editingAddressId = null;

  // Utilities
  function readCart(){ try{ return JSON.parse(localStorage.getItem(CART_KEY)||'[]'); }catch(e){return []} }
  function readAddresses(){ return state.addresses; }
  function money(v){ return '₱' + Number(v).toLocaleString('en-PH'); }

  function getDefaultAddress(){
    const addresses = readAddresses();
    return addresses.find(a=>a.isDefault) || addresses[0] || null;
  }

  function getCartTotals(){
    const cart = readCart();
    const subtotal = cart.reduce((s,i)=>s+i.price*i.qty,0);
    const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const total = subtotal + shipping;
    return { subtotal, shipping, total };
  }

  // Render order items in checkout
  function renderOrderItems(){
    const cart = readCart();
    const list = document.getElementById('orderItemsList');
    list.innerHTML = '';

    if(!cart || cart.length === 0){
      list.innerHTML = '<p class="text-muted">Your cart is empty</p>';
      return;
    }

    cart.forEach(item=>{
      const row = document.createElement('div');
      row.className = 'order-item';

      function norm(u){ if(typeof u !== 'string' || !u.trim()) return '/public/images/placeholder.png'; if (/^https?:\/\//i.test(u)) return u; if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return '/public/images/placeholder.png'; return u.startsWith('/') ? u : '/' + u; }
      const img = document.createElement('img');
      img.className = 'order-item-img';
      img.src = norm(item.imageUrl || '/public/images/placeholder.png');

      const info = document.createElement('div');
      info.className = 'order-item-info';
      const name = document.createElement('p');
      name.className = 'order-item-name';
      name.textContent = item.name;
      const meta = document.createElement('p');
      meta.className = 'order-item-meta';
      meta.textContent = `Qty: ${item.qty} × ${money(item.price)}`;
      info.appendChild(name);
      info.appendChild(meta);

      const total = document.createElement('strong');
      total.className = 'order-item-total';
      total.textContent = money(item.price * item.qty);

      row.appendChild(img);
      row.appendChild(info);
      row.appendChild(total);

      list.appendChild(row);
    });
  }

  // Render address display
  function renderAddressDisplay(){
    const addr = state.selectedAddress;
    const content = document.getElementById('addressContent');

    if(!addr){
      content.innerHTML = '<p class="text-muted">No address selected</p>';
      return;
    }

    const info = document.createElement('div');
    info.className = 'address-info';
    [addr.fullName, [addr.addressLine, addr.barangay].filter(Boolean).join(', '),
      `${addr.city}, ${addr.province} ${addr.zip}`, addr.mobile].forEach((value, index) => {
      const paragraph = document.createElement('p');
      const text = index === 0 ? document.createElement('strong') : paragraph;
      text.textContent = value || '';
      if (index === 0) paragraph.appendChild(text);
      info.appendChild(paragraph);
    });
    content.replaceChildren(info);
  }

  // Render payment totals
  function renderTotals(){
    const { subtotal, shipping, total } = getCartTotals();
    document.getElementById('subtotalText').textContent = money(subtotal);
    document.getElementById('shippingText').textContent = shipping === 0 ? 'FREE' : money(shipping);
    document.getElementById('totalText').textContent = money(total);
  }

  // Render payment method display
  function renderPaymentDisplay(){
    const noText = document.getElementById('noPaymentText');
    const selectedInfo = document.getElementById('selectedPaymentInfo');
    const content = document.getElementById('paymentInfoContent');

    if(!state.selectedPaymentMethod){
      noText.style.display = 'block';
      selectedInfo.style.display = 'none';
      return;
    }

    noText.style.display = 'none';
    selectedInfo.style.display = 'block';

    let html = '';
    const method = state.selectedPaymentMethod;

    if(method === 'GCash'){
      html = `
        <p><strong>GCash</strong></p>
        <p>Send payment to: <strong>0917-123-4567</strong></p>
        <p>Reference Number: <strong class="payment-reference"></strong></p>
        <button class="change-btn">Change</button>
      `;
    } else if(method === 'Bank Transfer'){
      html = `
        <p><strong>Bank Transfer</strong></p>
        <p><strong>Bank:</strong> Confirm with IOTEL</p>
        <p><strong>Account Number:</strong> Request bank details from IOTEL</p>
        <p>Reference Number: <strong class="payment-reference"></strong></p>
        <button class="change-btn">Change</button>
      `;
    } else if(method === 'Maya'){
      html = `
        <p><strong>Maya</strong></p>
        <p>Demo payment method</p>
        <p>Reference Number: <strong class="payment-reference"></strong></p>
        <button class="change-btn">Change</button>
      `;
    } else if(method === 'Cash on Delivery'){
      html = `
        <p><strong>Cash on Delivery</strong></p>
        <p>Pay when your order arrives</p>
        <p style="font-size:12px;color:#888;">No payment reference required</p>
        <button class="change-btn">Change</button>
      `;
    }

    content.innerHTML = html;
    const reference = content.querySelector('.payment-reference');
    if (reference) reference.textContent = state.paymentReference;
    content.querySelector('.change-btn').addEventListener('click', openPaymentModal);
  }

  // Open payment modal
  function openPaymentModal(){
    document.getElementById('paymentModal').style.display = 'flex';
    // Reset form
    document.querySelectorAll('input[name="paymentMethod"]').forEach(el => el.checked = false);
    document.getElementById('paymentRefNumber').value = '';
    document.getElementById('refNumberSection').style.display = 'none';
    document.getElementById('confirmPaymentBtn').disabled = true;
  }

  // Open address modal
  function openAddressModal(){
    const modal = document.getElementById('addressModal');
    const list = document.getElementById('addressesList');
    const addresses = readAddresses();

    list.innerHTML = '';
    addresses.forEach(addr=>{
      const card = document.createElement('div');
      card.className = 'address-card-selectable' + (state.selectedAddress && state.selectedAddress.id === addr.id ? ' selected' : '');
      const content = document.createElement('div');
      content.className = 'address-card-content';
      const name = document.createElement('p');
      const nameStrong = document.createElement('strong');
      nameStrong.textContent = addr.fullName || '';
      name.appendChild(nameStrong);
      const addressLine = document.createElement('p');
      addressLine.textContent = [addr.addressLine, addr.barangay].filter(Boolean).join(', ');
      const location = document.createElement('p');
      location.textContent = [addr.city, addr.province, addr.zip].filter(Boolean).join(', ').replace(`${addr.province},`, `${addr.province} `);
      const mobile = document.createElement('p');
      mobile.textContent = addr.mobile || '';
      content.append(name, addressLine, location, mobile);
      if(addr.isDefault){
        const badge = document.createElement('p');
        badge.className = 'default-badge';
        badge.textContent = 'Default';
        content.appendChild(badge);
      }

      const actions = document.createElement('div');
      actions.className = 'address-card-actions';
      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'change-btn';
      selectBtn.textContent = 'Select';
      selectBtn.addEventListener('click', ()=>{
        state.selectedAddress = addr;
        modal.style.display = 'none';
        renderAddressDisplay();
        updateOrderConfirmState();
      });
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'change-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', ()=>openAddressEditor(addr));
      actions.append(selectBtn, editBtn);
      card.append(content, actions);
      list.appendChild(card);
    });

    list.style.display = 'flex';
    document.getElementById('checkoutAddressForm').style.display = 'none';
    document.getElementById('addNewAddressBtn').style.display = 'block';
    modal.style.display = 'flex';
  }

  function openAddressEditor(addr){
    editingAddressId = addr ? addr.id : null;
    document.getElementById('checkoutAddressFormTitle').textContent = addr ? 'Edit Address' : 'Add New Address';
    document.getElementById('checkoutFullName').value = addr ? (addr.fullName || '') : '';
    document.getElementById('checkoutMobile').value = addr ? (addr.mobile || '') : '';
    document.getElementById('checkoutAddressLine').value = addr ? (addr.addressLine || '') : '';
    document.getElementById('checkoutBarangay').value = addr ? (addr.barangay || '') : '';
    document.getElementById('checkoutCity').value = addr ? (addr.city || '') : '';
    document.getElementById('checkoutProvince').value = addr ? (addr.province || '') : '';
    document.getElementById('checkoutZip').value = addr ? (addr.zip || '') : '';
    document.getElementById('addressesList').style.display = 'none';
    document.getElementById('checkoutAddressForm').style.display = 'block';
    document.getElementById('addNewAddressBtn').style.display = 'none';
  }

  async function saveCheckoutAddress(event){
    event.preventDefault();
    const list = readAddresses();
    const address = {
      id: editingAddressId || Date.now(),
      fullName: document.getElementById('checkoutFullName').value.trim(),
      mobile: document.getElementById('checkoutMobile').value.trim(),
      addressLine: document.getElementById('checkoutAddressLine').value.trim(),
      barangay: document.getElementById('checkoutBarangay').value.trim(),
      city: document.getElementById('checkoutCity').value.trim(),
      province: document.getElementById('checkoutProvince').value.trim(),
      zip: document.getElementById('checkoutZip').value.trim(),
      isDefault: false
    };
    if(editingAddressId){
      const index = list.findIndex(item=>item.id === editingAddressId);
      if(index !== -1) address.isDefault = list[index].isDefault;
    } else {
      address.isDefault = list.length === 0;
    }
    try {
      const result = await apiRequest(`/account/addresses${editingAddressId ? '/' + editingAddressId : ''}`, {
        method: editingAddressId ? 'PUT' : 'POST', body: JSON.stringify(address)
      });
      state.addresses = (await apiRequest('/account/addresses')).addresses;
      state.selectedAddress = result.address;
    } catch (error) { showError(error.message); return; }
    editingAddressId = null;
    document.getElementById('addressModal').style.display = 'none';
    renderAddressDisplay();
    updateOrderConfirmState();
  }

  // Update confirm order button state
  function updateOrderConfirmState(){
    const cart = readCart();
    const hasCart = cart && cart.length > 0;
    const hasAddress = state.selectedAddress != null;
    const hasPayment = state.selectedPaymentMethod != null;
    const refValid = state.selectedPaymentMethod === 'Cash on Delivery' || state.paymentReference.trim().length > 0;

    const btn = document.getElementById('confirmOrderBtn');
    btn.disabled = !(hasCart && hasAddress && hasPayment && refValid);
  }

  // Place order
  async function placeOrder(){
    const cart = readCart();
    if(!cart || cart.length === 0){
      showError('Your cart is empty');
      return;
    }

    if(!state.selectedAddress){
      showError('Please select a shipping address');
      return;
    }

    if(!state.selectedPaymentMethod){
      showError('Please select a payment method');
      return;
    }

    if(state.selectedPaymentMethod !== 'Cash on Delivery' && !state.paymentReference.trim()){
      showError('Please enter a payment reference number');
      return;
    }

    document.getElementById('confirmOrderBtn').disabled = true;
    try{
      // The backend reads real prices and stock from Firestore. It also stores a
      // validated copy of this delivery address with the order for fulfilment.
      const body = JSON.stringify({
          items: cart.map(item => ({ productId: String(item.productId), quantity: Number(item.qty) })),
          shippingAddress: state.selectedAddress,
          paymentMethod: state.selectedPaymentMethod === 'Cash on Delivery' ? 'cod' : 'bank_transfer',
          paymentReference: state.paymentReference
        });
      // Keep the same key after a timeout so retrying cannot reserve stock twice.
      let retry;
      try { retry = JSON.parse(sessionStorage.getItem('IOTEL_CHECKOUT_RETRY')); } catch {}
      if (!retry || retry.body !== body) retry = { body, key: crypto.randomUUID() };
      sessionStorage.setItem('IOTEL_CHECKOUT_RETRY', JSON.stringify(retry));
      const result = await apiRequest('/orders', {
        method: 'POST', body, headers: { 'Idempotency-Key': retry.key }
      });
      const order = {
        id: result.order.id,
        createdAt: new Date().toISOString(),
        items: result.order.items,
        subtotal: result.order.subtotal,
        shipping: result.order.shipping,
        total: result.order.total,
        shippingAddress: state.selectedAddress,
        payment: { method: state.selectedPaymentMethod, reference: state.paymentReference },
        status: result.order.orderStatus
      };
      localStorage.removeItem(CART_KEY);
      sessionStorage.removeItem('IOTEL_CHECKOUT_RETRY');
      window.location.href = `order-confirmation.html?orderId=${order.id}`;
    }catch(error){
      showError(error.message || 'Unable to create your order. Please try again.');
      updateOrderConfirmState();
    }
  }

  function showError(msg){
    const errorEl = document.getElementById('orderError');
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    setTimeout(()=>{ errorEl.style.display = 'none'; }, 5000);
  }

  // Event handlers
  document.addEventListener('DOMContentLoaded', async ()=>{
    // Load initial state
    state.cart = readCart();
    try { state.addresses = (await apiRequest('/account/addresses')).addresses; }
    catch (error) { showError(error.message); }
    state.selectedAddress = getDefaultAddress();

    renderOrderItems();
    renderAddressDisplay();
    renderPaymentDisplay();
    renderTotals();
    updateOrderConfirmState();

    // Address button
    const changeAddrBtn = document.getElementById('changeAddressBtn');
    if(changeAddrBtn) changeAddrBtn.addEventListener('click', openAddressModal);

    // Payment button
    const selectPaymentBtn = document.getElementById('selectPaymentBtn');
    if(selectPaymentBtn) selectPaymentBtn.addEventListener('click', openPaymentModal);

    // Payment modal - payment method selection
    document.querySelectorAll('input[name="paymentMethod"]').forEach(input=>{
      input.addEventListener('change', (e)=>{
        const method = e.target.value;
        const refSection = document.getElementById('refNumberSection');
        const refHint = document.getElementById('refHint');

        if(method === 'Cash on Delivery'){
          refSection.style.display = 'none';
        } else {
          refSection.style.display = 'block';
        }

        document.getElementById('confirmPaymentBtn').disabled = method === 'Cash on Delivery' ? false : false;
        updatePaymentConfirmState();
      });
    });

    // Reference number input
    const refInput = document.getElementById('paymentRefNumber');
    if(refInput){
      refInput.addEventListener('input', updatePaymentConfirmState);
    }

    // Close payment modal
    const closePaymentBtn = document.getElementById('closePaymentModal');
    if(closePaymentBtn) closePaymentBtn.addEventListener('click', ()=>{
      document.getElementById('paymentModal').style.display = 'none';
    });

    // Cancel payment modal
    const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
    if(cancelPaymentBtn) cancelPaymentBtn.addEventListener('click', ()=>{
      document.getElementById('paymentModal').style.display = 'none';
    });

    // Confirm payment method
    const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');
    if(confirmPaymentBtn){
      confirmPaymentBtn.addEventListener('click', ()=>{
        const selected = document.querySelector('input[name="paymentMethod"]:checked');
        if(!selected){
          showError('Please select a payment method');
          return;
        }

        const method = selected.value;
        const ref = method === 'Cash on Delivery' ? '' : document.getElementById('paymentRefNumber').value.trim();

        if(method !== 'Cash on Delivery' && !ref){
          showError('Please enter a payment reference number');
          return;
        }

        state.selectedPaymentMethod = method;
        state.paymentReference = ref;

        document.getElementById('paymentModal').style.display = 'none';
        renderPaymentDisplay();
        updateOrderConfirmState();
      });
    }

    // Modal overlay close
    const paymentOverlay = document.getElementById('paymentModalOverlay');
    if(paymentOverlay) paymentOverlay.addEventListener('click', ()=>{
      document.getElementById('paymentModal').style.display = 'none';
    });

    const addressOverlay = document.getElementById('addressModalOverlay');
    if(addressOverlay) addressOverlay.addEventListener('click', ()=>{
      document.getElementById('addressModal').style.display = 'none';
    });

    // Close address modal
    const closeAddressBtn = document.getElementById('closeAddressModal');
    if(closeAddressBtn) closeAddressBtn.addEventListener('click', ()=>{
      document.getElementById('addressModal').style.display = 'none';
    });

    const cancelAddressBtn = document.getElementById('cancelAddressBtn');
    if(cancelAddressBtn) cancelAddressBtn.addEventListener('click', ()=>{
      document.getElementById('addressModal').style.display = 'none';
    });

    const addNewAddressBtn = document.getElementById('addNewAddressBtn');
    if(addNewAddressBtn) addNewAddressBtn.addEventListener('click', ()=>openAddressEditor(null));

    const checkoutAddressForm = document.getElementById('checkoutAddressForm');
    if(checkoutAddressForm) checkoutAddressForm.addEventListener('submit', saveCheckoutAddress);

    const cancelCheckoutAddressBtn = document.getElementById('cancelCheckoutAddressBtn');
    if(cancelCheckoutAddressBtn) cancelCheckoutAddressBtn.addEventListener('click', openAddressModal);

    // Confirm order
    const confirmOrderBtn = document.getElementById('confirmOrderBtn');
    if(confirmOrderBtn) confirmOrderBtn.addEventListener('click', () => { placeOrder(); });
  });

  function updatePaymentConfirmState(){
    const selected = document.querySelector('input[name="paymentMethod"]:checked');
    if(!selected){
      document.getElementById('confirmPaymentBtn').disabled = true;
      return;
    }

    const method = selected.value;
    if(method === 'Cash on Delivery'){
      document.getElementById('confirmPaymentBtn').disabled = false;
    } else {
      const ref = document.getElementById('paymentRefNumber').value.trim();
      document.getElementById('confirmPaymentBtn').disabled = ref.length === 0;
    }
  }

})();

