(() => {
  const config = window.AGROSEED_CONFIG || { demoMode: false };
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(window.location.search);
  const productGrid = document.getElementById("product-grid");
  const listing = document.getElementById("catalog-listing");
  const detail = document.getElementById("product-detail");
  const unavailable = document.getElementById("catalog-unavailable");
  const demoNotice = document.getElementById("catalog-demo-notice");
  const title = document.getElementById("catalog-title");
  const description = document.getElementById("catalog-description");
  const breadcrumb = document.getElementById("breadcrumb-current");
  const count = document.getElementById("result-count");
  const empty = document.getElementById("empty-state");
  const sort = document.getElementById("catalog-sort");
  const searchInput = document.getElementById("catalog-search-input");
  const lang = localStorage.getItem("agroseed-language") || "en";
  let allProducts = [];

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const slugify = (value) => String(value || "").toLocaleLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const money = (paise) => new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0
  }).format((Number(paise) || 0) / 100);
  const productName = (product) => lang === "hi" ? (product.name || product.nameEn) : (product.nameEn || product.name);
  const brandName = (product) => lang === "hi" ? (product.brand || product.brandEn) : (product.brandEn || product.brand);
  const categoryName = (product) => lang === "hi" ? (product.category || product.categoryEn) : (product.categoryEn || product.category);
  const categoryUrl = (product) => `/category/${slugify(product.categoryEn || product.category)}`;
  const brandUrl = (product) => `/brand/${slugify(product.brandEn || product.brand)}`;
  const productUrl = (product) => `/product/${slugify(product.nameEn || product.name)}`;
  const currentLangName = (product, english, hindi) => lang === "hi" ? (product[hindi] || product[english]) : (product[english] || product[hindi]);

  function setViewHeading(heading, copy) {
    title.textContent = heading;
    description.textContent = copy;
    breadcrumb.textContent = heading;
    document.title = `${heading} | Agro Seed`;
  }

  function resolveRoute() {
    const categoryMatch = path.match(/^\/category\/([^/]+)$/);
    const brandMatch = path.match(/^\/brand\/([^/]+)$/);
    const productMatch = path.match(/^\/product\/([^/]+)$/);
    if (productMatch) return { type: "product", slug: productMatch[1] };
    if (categoryMatch) return { type: "category", slug: categoryMatch[1] };
    if (brandMatch) return { type: "brand", slug: brandMatch[1] };
    if (path === "/search") return { type: "search", query: (params.get("q") || "").trim() };
    return { type: "shop" };
  }

  function renderSideLinks(products) {
    const categories = [...new Map(products.map((product) => [product.categoryEn || product.category, product])).values()]
      .sort((a, b) => String(a.categoryEn).localeCompare(String(b.categoryEn)));
    const brands = [...new Map(products.map((product) => [product.brandEn || product.brand, product])).values()]
      .sort((a, b) => String(a.brandEn).localeCompare(String(b.brandEn)));
    document.getElementById("category-links").innerHTML = categories.map((product) => {
      const name = escapeHtml(currentLangName(product, "categoryEn", "category"));
      return `<a href="${categoryUrl(product)}">${name}</a>`;
    }).join("");
    document.getElementById("brand-links").innerHTML = brands.map((product) => {
      const name = escapeHtml(currentLangName(product, "brandEn", "brand"));
      return `<a href="${brandUrl(product)}">${name}</a>`;
    }).join("");
  }

  function renderCards(products) {
    productGrid.innerHTML = products.map((product) => `
      <article class="product-card">
        <a class="product-art" href="${productUrl(product)}" aria-label="${escapeHtml(productName(product))}">
          <span aria-hidden="true">✳</span><small class="sample-tag">SAMPLE</small>
        </a>
        <div class="product-card-body">
          <div class="product-brand"><a href="${brandUrl(product)}">${escapeHtml(brandName(product))}</a></div>
          <a class="product-title" href="${productUrl(product)}">${escapeHtml(productName(product))}</a>
          <a class="product-category" href="${categoryUrl(product)}">${escapeHtml(categoryName(product))}</a>
          <div class="product-price"><strong>${money(product.pricePaise)}</strong><del>${money(product.mrpPaise)}</del></div>
          <a class="card-link" href="${productUrl(product)}">View details ↗</a>
        </div>
      </article>`).join("");
    count.textContent = `${products.length} products`;
    empty.hidden = products.length > 0;
  }

  function renderProduct(product) {
    listing.hidden = true;
    document.getElementById("sort-control").hidden = true;
    detail.hidden = false;
    const name = escapeHtml(productName(product));
    const brand = escapeHtml(brandName(product));
    const category = escapeHtml(categoryName(product));
    setViewHeading(name, "Product information from the sample AgroSeed catalog.");
    detail.innerHTML = `
      <div class="detail-art" aria-hidden="true">✳</div>
      <div class="detail-copy">
        <a class="detail-category" href="${categoryUrl(product)}">${category}</a>
        <p class="detail-brand">${brand}</p>
        <h1>${name}</h1>
        <p class="sample-tag">SAMPLE PRODUCT</p>
        <div class="detail-price">${money(product.pricePaise)} <del>${money(product.mrpPaise)}</del></div>
        <p>SKU: ${escapeHtml(product.sku || "Owner to provide")}</p>
        <p>${Number.isFinite(Number(product.stock)) ? `Sample stock: ${escapeHtml(product.stock)}` : "Pack, stock, product images, and approved usage details will be added by AgroSeed."}</p>
        <p class="detail-note">This is placeholder catalog content for development. AgroSeed must approve the product, pack, price, and details before publishing.</p>
        <a class="card-link" href="/shop">← Back to all products</a>
      </div>`;
  }

  function render() {
    const route = resolveRoute();
    const query = route.type === "search" ? route.query.toLocaleLowerCase() : "";
    searchInput.value = route.type === "search" ? route.query : "";
    if (route.type === "product") {
      const product = allProducts.find((item) => slugify(item.nameEn || item.name) === route.slug);
      if (product) renderProduct(product);
      else {
        setViewHeading("Product not found", "This product is not in the sample catalog.");
        listing.hidden = true;
        unavailable.hidden = false;
      }
      return;
    }

    detail.hidden = true;
    listing.hidden = false;
    document.getElementById("sort-control").hidden = false;
    let products = [...allProducts];
    if (route.type === "category") {
      products = products.filter((item) => slugify(item.categoryEn || item.category) === route.slug);
      const selected = products[0];
      setViewHeading(selected ? currentLangName(selected, "categoryEn", "category") : "Category", "Products in this category.");
    } else if (route.type === "brand") {
      products = products.filter((item) => slugify(item.brandEn || item.brand) === route.slug);
      const selected = products[0];
      setViewHeading(selected ? currentLangName(selected, "brandEn", "brand") : "Brand", "Products from this brand.");
    } else if (route.type === "search") {
      products = products.filter((item) => [item.name, item.nameEn, item.brand, item.brandEn, item.category, item.categoryEn, item.sku]
        .some((value) => String(value || "").toLocaleLowerCase().includes(query)));
      setViewHeading("Search results", query ? `Results for “${route.query}”.` : "Search the catalog.");
    } else {
      setViewHeading(lang === "hi" ? "सभी उत्पाद" : "Shop all products", "Browse the sample AgroSeed catalog.");
    }
    const order = sort.value;
    if (order === "price-low") products.sort((a, b) => a.pricePaise - b.pricePaise);
    if (order === "price-high") products.sort((a, b) => b.pricePaise - a.pricePaise);
    if (order === "name") products.sort((a, b) => productName(a).localeCompare(productName(b)));
    renderCards(products);
  }

  document.getElementById("catalog-sort").addEventListener("change", render);
  document.querySelector(".catalog-search").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    window.location.href = query ? `/search?q=${encodeURIComponent(query)}` : "/shop";
  });

  if (config.demoMode !== true) {
    demoNotice.hidden = true;
    listing.hidden = true;
    unavailable.hidden = false;
    title.textContent = "Shop products";
    description.textContent = "The live AgroSeed product catalog is not connected yet.";
    breadcrumb.textContent = "Shop";
    document.title = "Shop products | Agro Seed";
    return;
  }

  demoNotice.hidden = false;
  fetch("/api/v1/products")
    .then((response) => {
      if (!response.ok) throw new Error("Catalog request failed");
      return response.json();
    })
    .then((payload) => {
      allProducts = Array.isArray(payload.items) ? payload.items : [];
      renderSideLinks(allProducts);
      render();
    })
    .catch(() => {
      listing.hidden = true;
      unavailable.hidden = false;
      title.textContent = "Catalog unavailable";
      description.textContent = "The sample catalog could not be loaded.";
      count.textContent = "";
    });
})();
