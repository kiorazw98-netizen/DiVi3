# Little Ledger

A small-business inventory and sales tracker built with HTML, CSS, JavaScript, Express, and SQLite.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Run `npm start`.
4. Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

The app creates `shop.db` in this folder the first time it starts. Keep this file to retain products and sales; back it up regularly. The app listens on localhost and is intended for a trusted, single-owner local setup.

## What it does

- Add, edit, search, and remove products from active inventory.
- Set each product's selling price, unit cost, quantity, and restock-alert level.
- Record sales with multiple products; stock is checked and reduced as one database transaction.
- Show daily revenue, estimated profit, recent sales, and low-stock reminders.
- Filter a sales report by date range. It opens with 12 October to 31 December 2026 selected, shows products and quantities on each sale, and uses South African rand. Profit is calculated from the unit costs saved when each sale was made.
- Add a typed owner signature to printed sales reports; the signature is saved in the current browser.
- Preserve old sales and their product names when a product is removed from active inventory.
