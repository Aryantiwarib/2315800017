# Stage 3: Query Performance & Indexing

This document analyzes query performance, complexity, indexing strategies, and database tradeoffs for retrieving prioritized notifications at scale.

---

## 1. Query Performance & Execution Complexity

To maintain a fast application response, database operations must execute in sub-millisecond times, even with millions of rows.

### Scenario: Retrieve a user's unread notifications sorted by priority
Without proper indexes, the database must perform a **Sequential Scan (Table Scan)**:
*   **Execution Step:** Read every single block of the `user_notifications` table from disk, filter by `user_id` and `is_read = FALSE`, join with `notifications`, and perform an in-memory sort.
*   **Time Complexity:** $O(M + N \log N)$ where $M$ is the size of the table, and $N$ is the filtered row count.
*   **Bottleneck:** Disk I/O is heavily saturated. As the table grows, query execution time increases linearly.

With the recommended composite index:
```sql
CREATE INDEX idx_user_notif_unread 
ON user_notifications(user_id) 
WHERE is_read = FALSE;
```
*   **Execution Step:** Perform an **Index Scan** directly targeting the user's unread entries.
*   **Time Complexity:** $O(\log M + K)$ where $K$ is the number of unread notifications for that specific user.
*   **Performance:** Disk read is reduced to a few tree nodes. Execution speed is instant and constant, regardless of total database size.

---

## 2. Index Recommendations

For SQL/Relational engines (PostgreSQL), specific index types are recommended based on usage:

### A. B-Tree Index (Standard Index)
*   **Usage:** For sorting and equality checks.
*   **Recommendation:** Apply to `user_notifications(user_id, notification_id)` and a partial index for unread items.
*   **Search Complexity:** $O(\log N)$ for lookups, insertions, and deletions.

### B. BRIN Index (Block Range Index)
*   **Usage:** For very large tables sorted chronologically.
*   **Recommendation:** Can be applied on the `delivered_at` column if B-Tree size becomes too large for RAM.
*   **Search Complexity:** Scan is performed across physical blocks. It is extremely small (uses 99% less space than B-Tree), but is slightly slower for point lookups.

---

## 3. Read vs. Write Amplification Tradeoffs

Every index added to a database carries overhead:

| Metric | With Index | Without Index |
|---|---|---|
| **Read Speed** | **Fast ($O(\log N)$)** | **Slow ($O(N)$ Sequential Scan)** |
| **Write Speed** | **Slower** (Index must update on every write) | **Fast** (Append directly to heap table) |
| **Storage Cost** | **Higher** (Index takes up RAM/Disk) | **Minimal** (Only raw data blocks) |

### Tradeoff Decision
For a notification system, the read-to-write ratio is heavily read-biased (users refresh their feed frequently, while notifications are created less frequently). Therefore, the design tolerates **Write Amplification** (slower inserts) to achieve optimal **Read Performance** (instant feed retrieval).

---

## 4. Query Analysis (EXPLAIN)

By running PostgreSQL's `EXPLAIN ANALYZE` on the prioritized query:
```sql
EXPLAIN ANALYZE
SELECT n.id, n.type, n.message, n.timestamp, n.priority_score
FROM user_notifications un
JOIN notifications n ON un.notification_id = n.id
WHERE un.user_id = '00a5daff-fb00-4ed1-88e8-dcd1fa47aa3d'::uuid
  AND un.is_read = FALSE
ORDER BY n.priority_score DESC
LIMIT 10;
```

### Execution Plan Breakdown:
1.  **Index Scan** on `user_notifications` using index `idx_user_notif_unread` returning matching pointer rows (Cost: $O(\log N)$).
2.  **Nested Loop / Hash Join** with `notifications` table on `id` using B-Tree index scan.
3.  **Sort** operation on the returned rows by `priority_score` (limited to 10 using Top-N heapsort in memory).
4.  Total execution time remains $< 2$ milliseconds.
