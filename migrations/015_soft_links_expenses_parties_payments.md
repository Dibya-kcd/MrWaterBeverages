# 015 — Soft links for Expenses, Parties, Payments (non-destructive)

## Goal
Improve relational clarity (primary / secondary keys) **without changing or rewriting
any existing realtime rows**. Past bills, payments, customers, and expenses keep working.

## Current storage (unchanged)
| Entity | Where it lives | Primary key |
|--------|----------------|-------------|
| Sell / Invoice | `bills` collection + dedicated fields | `id` (number) |
| Party | `customers` | `id` (`cust_…`) |
| Payment / Receipt | `payments` | `id` (`pay_…`) |
| Expense | `app_collections.business_expenses` (JSON list) | `id` (`exp_…`) |
| Trip | `trips` | `id` (number) |

## Soft foreign keys (all **optional**)
Existing rows may omit these fields. New UI writes them when the user picks a linked record.

### Bill (Sell)
- `id` — PK
- `customerId?` — → Customer.id
- `salesmanId?` — → Salesman.id
- `tripId?` — → Trip.id

### Payment
- `id` — PK
- `customerId?` — → Customer.id
- `billId?` — → Bill.id
- `salesmanId?` — → Salesman.id  
Legacy receipts still match by `customerName` + `customerPhone` when `customerId` is missing.

### Customer (Party)
- `id` — PK
- Looked up from bills/payments via `customerId` or name+phone fallback.

### Expense (extended, backward compatible)
- `id` — PK
- `customerId?` — → Customer.id (party / vendor paid)
- `billId?` — → Bill.id (optional related invoice)
- `paymentId?` — → Payment.id (optional)
- `tripId?` — → Trip.id
- `mode?`, `referenceNote?` — payment method metadata

## Database
No `ALTER TABLE` is required for live data:
- Expenses remain in `app_collections` under key `business_expenses`.
- New optional JSON fields are ignored by older clients and accepted by newer ones.
- Merge rule is still **newest `updatedAt` wins**; tombstones still hide deletes.

If a future release promotes expenses to a dedicated Postgres table, that migration
must only **ADD** nullable columns and backfill from the JSON collection — never drop
or rewrite historical rows in place during the cut-over window.
