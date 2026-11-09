(function () {
  function initializeDebugMenu() {
    if (window.AGROSEED_CONFIG?.devTools !== true || document.getElementById('agro-debug-root')) return;

    const root = document.createElement('div');
    root.id = 'agro-debug-root';
    root.innerHTML = `
      <button id="agro-debug-toggle" type="button" aria-expanded="false" aria-controls="agro-debug-panel">DEV</button>
      <section id="agro-debug-panel" aria-label="AgroSeed development checks" hidden>
        <h2>Backend connection check</h2>
        <p>Local development tools. Sample requests use sandbox data only.</p>
        <div class="agro-debug-row"><strong>API health</strong><span id="agro-debug-health" class="agro-debug-state" data-state="pending">Not checked</span></div>
        <div class="agro-debug-row"><strong>Product API</strong><span id="agro-debug-products" class="agro-debug-state" data-state="pending">Not checked</span></div>
        <div class="agro-debug-row"><strong>Order API</strong><span id="agro-debug-orders" class="agro-debug-state" data-state="pending">Not checked</span></div>
        <button id="agro-debug-check" class="agro-debug-action" type="button">Check backend</button>
        <button id="agro-debug-order" class="agro-debug-action secondary" type="button">Create one sample order</button>
        <pre id="agro-debug-output" aria-live="polite">Open the panel and check the API.</pre>
        <div class="agro-debug-warning">Orders created here are fake sandbox records. No customer data or payment is used.</div>
      </section>`;
    document.body.append(root);

    const toggle = root.querySelector('#agro-debug-toggle');
    const panel = root.querySelector('#agro-debug-panel');
    const output = root.querySelector('#agro-debug-output');
    const checkButton = root.querySelector('#agro-debug-check');
    const orderButton = root.querySelector('#agro-debug-order');

    function setState(id, label, state) {
      const badge = root.querySelector(id);
      badge.textContent = label;
      badge.dataset.state = state;
    }

    function setOutput(value) {
      output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    }

    async function getJson(url, options) {
      const response = await fetch(url, { cache: 'no-store', ...options });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      return payload;
    }

    async function checkBackend() {
      checkButton.disabled = true;
      setState('#agro-debug-health', 'Checking…', 'pending');
      setState('#agro-debug-products', 'Checking…', 'pending');
      setState('#agro-debug-orders', 'Not run', 'pending');
      const results = [];
      try {
        const health = await getJson('/api/v1/health');
        setState('#agro-debug-health', 'OK', 'ok');
        results.push({ check: 'health', ...health });
      } catch (error) {
        setState('#agro-debug-health', 'Failed', 'error');
        results.push({ check: 'health', error: error.message });
      }

      try {
        const catalog = await getJson('/api/v1/products');
        setState('#agro-debug-products', `${catalog.total} products`, 'ok');
        results.push({ check: 'products', count: catalog.total, firstProduct: catalog.items?.[0]?.nameEn || null });
        setState('#agro-debug-orders', 'Ready', 'ok');
      } catch (error) {
        setState('#agro-debug-products', 'Failed', 'error');
        setState('#agro-debug-orders', 'Unavailable', 'error');
        results.push({ check: 'products', error: error.message });
      }

      setOutput(results);
      checkButton.disabled = false;
    }

    async function createSampleOrder() {
      orderButton.disabled = true;
      setState('#agro-debug-orders', 'Creating…', 'pending');
      try {
        const catalog = await getJson('/api/v1/products');
        if (!catalog.items?.length) throw new Error('No sandbox product is available');
        const order = await getJson('/api/v1/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ productId: catalog.items[0].id, quantity: 1 }] })
        });
        setState('#agro-debug-orders', 'Created', 'ok');
        setOutput({ check: 'sandbox order', orderNumber: order.orderNumber, status: order.status, totalPaise: order.totalPaise });
      } catch (error) {
        setState('#agro-debug-orders', 'Failed', 'error');
        setOutput({ check: 'sandbox order', error: error.message });
      } finally {
        orderButton.disabled = false;
      }
    }

    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) checkBackend();
    });
    checkButton.addEventListener('click', checkBackend);
    orderButton.addEventListener('click', createSampleOrder);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDebugMenu, { once: true });
  } else {
    initializeDebugMenu();
  }
})();
