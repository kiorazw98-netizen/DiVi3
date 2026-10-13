const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const port = Number(process.env.PORT) || 3000;
const db = new Database(path.join(__dirname, "shop.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    price REAL NOT NULL CHECK (price >= 0),
    cost REAL NOT NULL CHECK (cost >= 0),
    stock INTEGER NOT NULL CHECK (stock >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sold_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    unit_cost REAL NOT NULL CHECK (unit_cost >= 0)
  );
  CREATE INDEX IF NOT EXISTS sales_sold_at_idx ON sales(sold_at);
  CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items(sale_id);
`);

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function numberFromInput(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

function validateProduct(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw httpError(400, "Product details must be provided as an object.");
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const category = typeof input.category === "string" && input.category.trim()
    ? input.category.trim()
    : "General";
  const rawPrice = numberFromInput(input.price);
  const rawCost = numberFromInput(input.cost);
  const price = Math.round(rawPrice * 100) / 100;
  const cost = Math.round(rawCost * 100) / 100;
  const stock = numberFromInput(input.stock);
  const lowStockThreshold = input.lowStockThreshold === null || input.lowStockThreshold === undefined
    ? 5
    : numberFromInput(input.lowStockThreshold);

  if (!name || name.length > 100) throw httpError(400, "Product name must be 1–100 characters.");
  if (!Number.isFinite(rawPrice) || rawPrice < 0
    || !Number.isSafeInteger(Math.round(rawPrice * 100))
    || Math.abs(rawPrice * 100 - Math.round(rawPrice * 100)) > 1e-8) {
    throw httpError(400, "Enter a valid selling price with no more than two decimal places.");
  }
  if (!Number.isFinite(rawCost) || rawCost < 0
    || !Number.isSafeInteger(Math.round(rawCost * 100))
    || Math.abs(rawCost * 100 - Math.round(rawCost * 100)) > 1e-8) {
    throw httpError(400, "Enter a valid unit cost with no more than two decimal places.");
  }
  if (!Number.isSafeInteger(stock) || stock < 0) {
    throw httpError(400, "Stock must be a whole number of 0 or more.");
  }
  if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) {
    throw httpError(400, "The low-stock alert level must be a whole number of 0 or more.");
  }

  return { name, category: category.slice(0, 60), price, cost, stock, lowStockThreshold };
}

function handleErrors(handler) {
  return (req, res, next) => {
    try {
      handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

app.get("/api/dashboard", handleErrors((req, res) => {
  const products = db.prepare(`
    SELECT id, name, category, price, cost, stock, low_stock_threshold AS lowStockThreshold
    FROM products WHERE active = 1 ORDER BY name COLLATE NOCASE
  `).all();
  const lowStock = db.prepare(`
    SELECT id, name, stock, low_stock_threshold AS lowStockThreshold
    FROM products
    WHERE active = 1 AND stock <= low_stock_threshold
    ORDER BY stock ASC, name COLLATE NOCASE
  `).all();
  const today = db.prepare(`
    SELECT COUNT(DISTINCT s.id) AS salesCount,
      COALESCE(SUM(si.quantity * si.unit_price), 0) AS revenue,
      COALESCE(SUM(si.quantity * si.unit_cost), 0) AS cost,
      COALESCE(SUM(si.quantity), 0) AS units
    FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE date(s.sold_at, 'localtime') = date('now', 'localtime')
  `).get();
  const recentSales = db.prepare(`
    SELECT s.id, s.sold_at AS soldAt,
      COALESCE(SUM(si.quantity * si.unit_price), 0) AS total,
      COALESCE(SUM(si.quantity), 0) AS units,
      COALESCE(GROUP_CONCAT(si.quantity || ' x ' || si.product_name, ', '), '') AS products
    FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
    GROUP BY s.id ORDER BY s.sold_at DESC, s.id DESC LIMIT 8
  `).all();

  res.json({ products, lowStock, today: { ...today, profit: today.revenue - today.cost }, recentSales });
}));

app.post("/api/products", handleErrors((req, res) => {
  const product = validateProduct(req.body);
  const result = db.prepare(`
    INSERT INTO products (name, category, price, cost, stock, low_stock_threshold)
    VALUES (@name, @category, @price, @cost, @stock, @lowStockThreshold)
  `).run(product);
  res.status(201).json({ id: Number(result.lastInsertRowid), ...product });
}));

app.put("/api/products/:id", handleErrors((req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw httpError(400, "Invalid product.");
  const product = validateProduct(req.body);
  const result = db.prepare(`
    UPDATE products
    SET name = @name, category = @category, price = @price, cost = @cost,
      stock = @stock, low_stock_threshold = @lowStockThreshold
    WHERE id = @id AND active = 1
  `).run({ ...product, id });
  if (!result.changes) throw httpError(404, "Product not found.");
  res.json({ id, ...product });
}));

app.delete("/api/products/:id", handleErrors((req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw httpError(400, "Invalid product.");
  const result = db.prepare("UPDATE products SET active = 0 WHERE id = ? AND active = 1").run(id);
  if (!result.changes) throw httpError(404, "Product not found.");
  res.status(204).end();
}));

app.post("/api/sales", handleErrors((req, res) => {
  const items = req.body && typeof req.body === "object" ? req.body.items : null;
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw httpError(400, "Add at least one product to the sale.");
  }
  const quantities = new Map();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw httpError(400, "Each sale item must include a product and quantity.");
    }
    const id = numberFromInput(item.productId);
    const quantity = numberFromInput(item.quantity);
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(quantity) || quantity < 1) {
      throw httpError(400, "Each sale needs a valid product and a whole-number quantity.");
    }
    const totalQuantity = (quantities.get(id) || 0) + quantity;
    if (!Number.isSafeInteger(totalQuantity)) throw httpError(400, "A product quantity is too large.");
    quantities.set(id, totalQuantity);
  }

  const recordSale = db.transaction(() => {
    const selected = [];
    for (const [id, quantity] of quantities) {
      const product = db.prepare(`
        SELECT id, name, price, cost, stock FROM products WHERE id = ? AND active = 1
      `).get(id);
      if (!product) throw httpError(404, "One of the selected products is no longer available.");
      if (product.stock < quantity) throw httpError(409, `Not enough stock for ${product.name}. Only ${product.stock} left.`);
      selected.push({ ...product, quantity });
    }

    const saleId = Number(db.prepare("INSERT INTO sales DEFAULT VALUES").run().lastInsertRowid);
    const insertItem = db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, unit_cost)
      VALUES (@saleId, @id, @name, @quantity, @price, @cost)
    `);
    const reduceStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
    for (const item of selected) {
      insertItem.run({ ...item, saleId });
      reduceStock.run(item.quantity, item.id);
    }

    return {
      id: saleId,
      total: Math.round(selected.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100,
      units: selected.reduce((sum, item) => sum + item.quantity, 0)
    };
  });

  res.status(201).json(recordSale());
}));

app.get("/api/reports", handleErrors((req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const isValidDate = (value) => typeof value === "string" && datePattern.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if ((from !== undefined && !isValidDate(from)) || (to !== undefined && !isValidDate(to))) {
    throw httpError(400, "Report dates must be valid dates in YYYY-MM-DD format.");
  }
  if (from && to && from > to) throw httpError(400, "The start date must be before the end date.");
  const where = [];
  const params = {};
  if (from) {
    where.push("date(s.sold_at, 'localtime') >= @from");
    params.from = from;
  }
  if (to) {
    where.push("date(s.sold_at, 'localtime') <= @to");
    params.to = to;
  }
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const summary = db.prepare(`
    SELECT COUNT(DISTINCT s.id) AS salesCount,
      COALESCE(SUM(si.quantity * si.unit_price), 0) AS revenue,
      COALESCE(SUM(si.quantity * si.unit_cost), 0) AS cost,
      COALESCE(SUM(si.quantity), 0) AS units
    FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id ${filter}
  `).get(params);
  const sales = db.prepare(`
    SELECT s.id, s.sold_at AS soldAt,
      COALESCE(SUM(si.quantity * si.unit_price), 0) AS revenue,
      COALESCE(SUM(si.quantity * si.unit_cost), 0) AS cost,
      COALESCE(SUM(si.quantity), 0) AS units,
      COALESCE(GROUP_CONCAT(si.quantity || ' x ' || si.product_name, ', '), '') AS products
    FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
    ${filter} GROUP BY s.id ORDER BY s.sold_at DESC, s.id DESC
  `).all(params).map((sale) => ({ ...sale, profit: sale.revenue - sale.cost }));

  res.json({ ...summary, profit: summary.revenue - summary.cost, sales });
}));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error(error);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Stock & Sales is ready at http://127.0.0.1:${port}`);
});
