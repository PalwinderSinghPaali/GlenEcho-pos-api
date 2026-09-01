# Lightspeed Retail (R-Series) Integration & Sync Engine Guide

This document provides a comprehensive guide to understanding the Lightspeed integration in this codebase. It explains why the system is designed this way, how the data flows bidirectionally, how real-time syncing operates, and which files/functions perform each task.

---

## 1. Architectural Foundation: Why `sync_jobs` Exists

In many systems, API integrations are handled inline (e.g., when a user updates a product, the server immediately sends an HTTP request to Lightspeed in the same request thread). This naive approach has severe limitations:
1. **Blocking Requests**: Slow network requests or API outages block the application thread, causing high latencies or timeouts for the end-user.
2. **Data Inconsistency**: If the database transaction succeeds but the Lightspeed API call fails, the local database and Lightspeed will be out of sync.
3. **No Automatic Recovery**: Failed API requests are lost unless manual reconciliation scripts are run.

To solve this, this integration implements a **Transactional Outbox (Database-Backed Queue)** pattern using the `sync_jobs` table.

### How it Works:
- When a change occurs (either via scheduler or web request), the local database changes and a record in the `sync_jobs` table are saved **in the same database transaction**.
- Because they are in the same transaction, they either both succeed (commit) or both fail (rollback). This guarantees that every change is tracked for synchronization.
- An asynchronous background worker polls the `sync_jobs` table, claims pending tasks under database-row locks, handles the API request, and logs the result.
- If a network failure occurs, the task is automatically re-queued for retry with **exponential backoff**. If it exceeds maximum attempts, it goes to the **Dead Letter Queue (DLQ)** state (`dead_letter`) for manual inspection and retries via the dashboard.

---

## 2. Synchronization State Machine
Each sync job transitions through states:

```
[ pending ] ──(Worker Claims Job)──> [ processing ] ──(Success)──> [ done ]
                                           │
                                           ├──(Failure, attempts < max)──> [ retry ] ──(Backoff wait)──> [ pending ]
                                           │
                                           └──(Failure, attempts >= max)─> [ dead_letter ] (DLQ)
```

- **Watchdog Recovery**: A watchdog loop runs every 1 minute to detect jobs stuck in `processing` (e.g., if a worker crashed) and moves them back to `retry` or `dead_letter`.
- **Automated Pruning**: To prevent database bloat, the watchdog automatically deletes `done` jobs older than 24 hours and `dead_letter` jobs older than 7 days. This uses the composite index `(status, run_at)` for high performance.

---

## 3. Inbound Sync (Lightspeed ➔ Local DB)
Inbound sync reconciles stock, catalog metadata, and prices from the Lightspeed POS into the local database.

### 3.1 Watermark (Cursor-Based) Syncing
To avoid downloading tens of thousands of products on every poll:
- The [LightspeedSyncState](/src/database/models/lightspeed-sync-state.model.ts) model tracks the `last_cursor_ts` (a string timestamp) for each entity type.
- Every API call requests data where `timeStamp => {last_cursor_ts}`.
- Upon successfully processing a page of data, the latest timestamp returned by Lightspeed is stored back in `last_cursor_ts`. The next poll starts exactly where the previous one ended.

### 3.2 Pollers
1. **Fast Inventory Poll (`poll_inventory_fast` - runs every 30 seconds)**:
   - Queries Lightspeed `/Item.json` with the cursor.
   - Enqueues page jobs (`SYNC_PRODUCT_PAGE`) containing the modified items.
   - Synchronizes product fields, prices, and stock values.
2. **Slow Catalog Poll (`poll_catalog_slow` - runs every 10 minutes)**:
   - Pulls catalog lookups: `/Shop.json`, `/Vendor.json`, `/Manufacturer.json` (Brands), `/Category.json`, `/Tag.json`, and `/ItemMatrix.json`.
   - Enqueues corresponding sync jobs (e.g., `SYNC_SHOP_PAGE`, `SYNC_CATEGORY_PAGE`).
3. **Full Bootstrap / Rebuilding (`BOOTSTRAP_SYNC` - manual trigger)**:
   - Resets all cursor watermarks to `null`.
   - Sequential, dependency-ordered full sync runs synchronously in the background worker. Categories are sorted by depth level to guarantee parent categories exist before child nodes.

---

## 4. Outbound Sync (Local DB ➔ Lightspeed)
Outbound sync pushes local inventory updates and online sales back into the POS.

### 4.1 Actions
- **Field & Price Updates**: Local mutations enqeue `PUSH_PRODUCT_FIELDS` with the updated JSON payload, sending `PUT /Item/{id}.json` containing only the modified fields.
- **Archiving**: Deactivating local products enqueues `PUSH_PRODUCT_ARCHIVE`, sending `DELETE /Item/{id}.json`.
- **Sales Sync**: During checkout setup, an open sale (`completed: false`) is pushed to Lightspeed to calculate final taxes and totals. Once the Stripe payment succeeds, it enqueues a `COMPLETE_SALE` job. The worker pushes a `PUT /Sale/{saleID}.json` completion payload with the payment information, which records the sale and automatically updates the stock in Lightspeed.

---

## 5. Real-Time Syncing Mechanics
While true real-time webhook sync is not used due to API delivery guarantees, the system achieves **near real-time syncing** (within seconds):

1. **Local Changes (Real-Time Outbound)**:
   - When a price is updated via the admin dashboard, the update transaction inserts the pending job into `sync_jobs`.
   - The worker polling loop checks for pending jobs **every 5 seconds**.
   - As a result, local changes are pushed to Lightspeed within 0–5 seconds.
2. **Lightspeed Changes (Near Real-Time Inbound)**:
   - The scheduler triggers the fast inventory poll **every 30 seconds**.
   - Changes made at the physical registers are captured in the next poll and instantly applied locally.

---

## 6. Codebase Map & Directory Register

### 6.1 Database Models (`src/database/models/`)
* **[lightspeed-config.model.ts](/src/database/models/lightspeed-config.model.ts)**: Stores OAuth2 credentials, account ID, and refresh tokens.
* **[lightspeed-sync-job.model.ts](/src/database/models/lightspeed-sync-job.model.ts)**: Represents the `sync_jobs` queue.
* **[lightspeed-sync-state.model.ts](/src/database/models/lightspeed-sync-state.model.ts)**: Stores timestamp cursors for each entity.
* **[lightspeed-entity-map.model.ts](/src/database/models/lightspeed-entity-map.model.ts)**: Holds book-keeping mappings between Lightspeed IDs and local PKs, as well as a SHA1 hash used for change-detection.

### 6.2 Service Logic
* **[lightspeed.ts (LightspeedService)](/src/services/lightspeed.ts)**:
  - `getAccessToken()`: Retrieves or refreshes OAuth tokens under a row-level database lock.
  - `makeRequest()`: Generic request client handling timeouts, automatic rate-limiting throttling (Leaky Bucket header), and HTTP 429 retries.
  - `enqueuePushJob()`: Transactional outbox helper to write push jobs to the database. Automatically skips creating a job if the changed payload is empty.
  - `syncItemsPage()`: Parses Lightspeed items, updates product data, stock metrics, and schedules `SYNC_IMAGE` jobs.
  - `syncEntityDirectly()` / `bootstrapSync()`: Handlers for bootstrap migration sequence.
* **[lightspeed-queue.ts (LightspeedQueue)](/src/services/lightspeed-queue.ts)**:
  - `startWorker()` / `stopWorker()`: Manages the worker setInterval loops (5s poll, 60s watchdog).
  - `processNextJob()`: Claims the next job using `SKIP LOCKED` rows and manages state transitions.
  - `handleJob()`: Routes the job payload to the correct handler in `LightspeedService` or local helpers.
  - `executeWatchdog()`: Reclaims stuck jobs and prunes old entries.

### 6.3 Routing & Controllers (`src/controllers/lightspeed.ts`)
* **[lightspeed.ts (Controller)](/src/controllers/lightspeed.ts)**:
  - `triggerSync()`: Exposes `POST /sync` to queue an inventory poll job immediately.
  - `triggerBootstrap()`: Exposes `POST /triggerBootstrap` to clear and start a clean full migration.
  - `getQueue()` / `getDashboard()`: Status listings and metric monitoring.
  - `retryJob()`: Resets `dead_letter` tasks back to `pending`.
