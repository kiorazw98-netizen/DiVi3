const state = { products: [], lowStock: [], deletingId: null, toastTimer: null };
const money = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });
const signatureStorageKey = "little-ledger-report-signature";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 3400);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatDate(value) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatTime(value) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatReportDate(value) {
  if (!value) return "Any date";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function tone(index) {
  return `tone-${index % 5}`;
}

function productBadge(name, index) {
  return `<span class="product-initial ${tone(index)}">${escapeHtml(name.trim().charAt(0) || "?")}</span>`;
}

function stockStatus(product) {
  if (product.stock === 0) return '<span class="status-pill out">Out of stock</span>';
  if (product.stock <= product.lowStockThreshold) return '<span class="status-pill low">Running low</span>';
  return '<span class="status-pill">In stock</span>';
}

async function loadDashboard() {
  const data = await api("/api/dashboard");
  state.products = data.products;
  state.lowStock = data.lowStock;

  $("#today-revenue").textContent = money.format(data.today.revenue);
  $("#today-profit").textContent = money.format(data.today.profit);
  $("#today-units").textContent = `${data.today.units} ${data.today.units === 1 ? "item" : "items"} sold`;
  $("#stock-count").textContent = data.products.length;
  $("#low-stock-count").textContent = data.lowStock.length;
  $("#product-count").textContent = data.products.length;
  $("#inventory-heading-count").textContent = data.products.length;
  $("#low-stock-pill").textContent = data.lowStock.length;
  $("#alert-dot").hidden = data.lowStock.length === 0;
  renderStockWatch();
  renderLowStock();
  renderInventory();
  renderRecentSales(data.recentSales);
}

function renderStockWatch() {
  const products = state.products.slice(0, 5);
  $("#empty-products").hidden = state.products.length > 0;
  $("#stock-watch-body").innerHTML = products.map((product, index) => `
    <tr>
      <td><div class="product-cell">${productBadge(product.name, index)}<span>${escapeHtml(product.name)}</span></div></td>
      <td>${money.format(product.price)}</td>
      <td>${product.stock}</td>
      <td>${stockStatus(product)}</td>
    </tr>`).join("");
}

function renderLowStock() {
  const list = $("#low-stock-list");
  $("#all-good-state").hidden = state.lowStock.length > 0;
  if (!state.lowStock.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = state.lowStock.slice(0, 5).map((product, index) => `
    <div class="reminder-item">
      ${productBadge(product.name, index)}
      <div class="reminder-copy"><strong>${escapeHtml(product.name)}</strong><span>Alert at ${product.lowStockThreshold} left</span></div>
      <span class="reminder-quantity">${product.stock} left</span>
    </div>`).join("");
}

function renderInventory() {
  const query = $("#product-search").value.trim().toLowerCase();
  const products = state.products.filter((product) =>
    product.name.toLowerCase().includes(query) || product.category.toLowerCase().includes(query)
  );
  $("#inventory-body").innerHTML = products.map((product, index) => `
    <tr>
      <td><div class="product-cell">${productBadge(product.name, index)}<span>${escapeHtml(product.name)}</span></div></td>
      <td>${escapeHtml(product.category)}</td>
      <td>${money.format(product.price)}</td>
      <td>${money.format(product.cost)}</td>
      <td>${product.stock}</td>
      <td>${stockStatus(product)}</td>
      <td><div class="row-actions">
        <button class="small-action" data-edit="${product.id}">Edit</button>
        <button class="small-action delete" data-delete="${product.id}">Remove</button>
      </div></td>
    </tr>`).join("");
  $("#empty-inventory").hidden = products.length > 0;
}

function renderRecentSales(sales) {
  $("#recent-sales-body").innerHTML = sales.map((sale) => `
    <tr>
      <td class="sale-id">#${sale.id.toString().padStart(4, "0")}</td>
      <td>${formatDate(sale.soldAt)} · ${formatTime(sale.soldAt)}</td>
      <td>${escapeHtml(sale.products)}</td>
      <td class="sale-total-cell">${money.format(sale.total)}</td>
      <td></td>
    </tr>`).join("");
  $("#empty-sales").hidden = sales.length > 0;
}

function openProductDialog(product = null) {
  const form = $("#product-form");
  form.reset();
  form.elements.id.value = product?.id ?? "";
  $("#product-dialog-title").textContent = product ? "Edit product" : "Add a product";
  $("#product-submit").textContent = product ? "Save changes" : "Save product";
  if (product) {
    form.elements.name.value = product.name;
    form.elements.category.value = product.category;
    form.elements.price.value = product.price;
    form.elements.cost.value = product.cost;
    form.elements.stock.value = product.stock;
    form.elements.lowStockThreshold.value = product.lowStockThreshold;
  }
  $("#product-dialog").showModal();
  form.elements.name.focus();
}

function addSaleLine() {
  const available = state.products.filter((product) => product.stock > 0);
  if (!available.length) {
    showToast("Add a product with stock before recording a sale.", true);
    return;
  }
  const line = document.createElement("div");
  line.className = "sale-line";
  line.innerHTML = `
    <label class="field-label">Product
      <select class="sale-product" required>
        ${available.map((product) => `<option value="${product.id}" data-price="${product.price}" data-stock="${product.stock}">${escapeHtml(product.name)} · ${product.stock} left</option>`).join("")}
      </select>
    </label>
    <label class="field-label">Quantity
      <input class="sale-quantity" type="number" min="1" step="1" value="1" required>
    </label>
    <button class="remove-sale-line" type="button" aria-label="Remove product">×</button>`;
  $("#sale-lines").append(line);
  line.querySelector(".sale-product").addEventListener("change", updateSaleTotal);
  line.querySelector(".sale-quantity").addEventListener("input", updateSaleTotal);
  line.querySelector(".remove-sale-line").addEventListener("click", () => {
    line.remove();
    if (!$("#sale-lines").children.length) addSaleLine();
    updateSaleTotal();
  });
  updateSaleTotal();
}

function updateSaleTotal() {
  let total = 0;
  $$(".sale-line", $("#sale-lines")).forEach((line) => {
    const selected = $(".sale-product", line).selectedOptions[0];
    const quantity = Math.max(0, Number($(".sale-quantity", line).value) || 0);
    const stock = Number(selected.dataset.stock);
    $(".sale-quantity", line).max = String(stock);
    total += Number(selected.dataset.price) * quantity;
  });
  $("#sale-total").textContent = money.format(total);
}

async function loadReport() {
  const params = new URLSearchParams();
  const from = $("#report-from").value;
  const to = $("#report-to").value;
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  $("#report-range-summary").textContent = `${formatReportDate(from)} – ${formatReportDate(to)}`;
  const report = await api(`/api/reports?${params}`);
  $("#report-sales-count").textContent = report.salesCount;
  $("#report-units").textContent = report.units;
  $("#report-revenue").textContent = money.format(report.revenue);
  $("#report-cost").textContent = money.format(report.cost);
  $("#report-profit").textContent = money.format(report.profit);
  $("#report-body").innerHTML = report.sales.map((sale) => `
    <tr>
      <td class="sale-id">#${sale.id.toString().padStart(4, "0")}</td>
      <td>${formatDate(sale.soldAt)} · ${formatTime(sale.soldAt)}</td>
      <td>${escapeHtml(sale.products)}</td>
      <td>${money.format(sale.revenue)}</td>
      <td>${money.format(sale.cost)}</td>
      <td class="sale-total-cell">${money.format(sale.profit)}</td>
    </tr>`).join("");
  $("#empty-report").hidden = report.sales.length > 0;
}

function navigate(view) {
  const labels = { overview: "Overview", inventory: "Inventory", reports: "Reports" };
  $$(".view-section").forEach((section) => { section.hidden = section.id !== `${view}-view`; });
  $$(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === view));
  $("#breadcrumb-current").textContent = labels[view];
  if (view === "reports") loadReport().catch((error) => showToast(error.message, true));
}

function initialize() {
  $("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date());
  $("#report-from").value = "2026-10-12";
  $("#report-to").value = "2026-12-31";
  try {
    const signature = localStorage.getItem(signatureStorageKey) || "";
    $("#owner-signature").value = signature;
    $("#signature-preview").textContent = signature;
  } catch (error) {
    showToast("Your saved signature could not be loaded in this browser.", true);
  }

  $$(".nav-link").forEach((link) => link.addEventListener("click", () => navigate(link.dataset.view)));
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.go)));
  $("#add-product-open").addEventListener("click", () => openProductDialog());
  $("#first-product-open").addEventListener("click", () => openProductDialog());
  $("#record-sale-open").addEventListener("click", () => {
    $("#sale-lines").innerHTML = "";
    if (state.products.some((product) => product.stock > 0)) {
      addSaleLine();
      $("#sale-dialog").showModal();
    } else {
      showToast("Add a product with stock before recording a sale.", true);
    }
  });
  $("#add-sale-line").addEventListener("click", addSaleLine);
  $("#alert-button").addEventListener("click", () => {
    if (state.lowStock.length) {
      navigate("overview");
      $("#low-stock-list").scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      showToast("Everything is above its restock level.");
    }
  });
  $("#product-search").addEventListener("input", renderInventory);
  $("#apply-report").addEventListener("click", () => loadReport().catch((error) => showToast(error.message, true)));
  $("#print-report").addEventListener("click", () => window.print());
  $("#owner-signature").addEventListener("input", (event) => {
    const signature = event.currentTarget.value.trim();
    $("#signature-preview").textContent = signature;
    try {
      localStorage.setItem(signatureStorageKey, signature);
    } catch (error) {
      showToast("Your signature could not be saved in this browser.", true);
    }
  });
  $$("[data-close]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));

  $("#product-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const id = data.id;
    delete data.id;
    const product = {
      ...data,
      price: Number(data.price),
      cost: Number(data.cost),
      stock: Number(data.stock),
      lowStockThreshold: Number(data.lowStockThreshold)
    };
    try {
      await api(id ? `/api/products/${id}` : "/api/products", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(product)
      });
      $("#product-dialog").close();
      await loadDashboard();
      showToast(id ? "Product details updated." : "Product added to your shelves.");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  $("#inventory-body").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");
    if (editButton) {
      const product = state.products.find((item) => item.id === Number(editButton.dataset.edit));
      if (product) openProductDialog(product);
    }
    if (deleteButton) {
      state.deletingId = Number(deleteButton.dataset.delete);
      const product = state.products.find((item) => item.id === state.deletingId);
      $("#delete-description").textContent = `${product?.name ?? "This product"} will leave your active inventory, but past sales will stay in your reports.`;
      $("#delete-dialog").showModal();
    }
  });

  $("#confirm-delete").addEventListener("click", async () => {
    try {
      await api(`/api/products/${state.deletingId}`, { method: "DELETE" });
      $("#delete-dialog").close();
      await loadDashboard();
      showToast("Product removed. Past sales are still saved.");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  $("#sale-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const items = $$(".sale-line", $("#sale-lines")).map((line) => ({
      productId: Number($(".sale-product", line).value),
      quantity: Number($(".sale-quantity", line).value)
    }));
    if (!items.length || items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
      showToast("Enter a whole-number quantity for each product.", true);
      return;
    }
    try {
      const sale = await api("/api/sales", { method: "POST", body: JSON.stringify({ items }) });
      $("#sale-dialog").close();
      await loadDashboard();
      showToast(`Sale #${sale.id.toString().padStart(4, "0")} saved. Stock is up to date.`);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  loadDashboard().catch((error) => showToast(`Couldn’t load your shop: ${error.message}`, true));
}

initialize();
