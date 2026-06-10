# Stage 2: Database Design & Scaling

This document details the database selection, schema design, database partitioning, indexing strategies, and sample queries for a production-grade notification system.

---

## 1. Database Selection

For a large-scale notification system, the choice typically comes down to **PostgreSQL** (Relational with JSONB support) or **MongoDB** (Document-based).

| Metric | PostgreSQL | MongoDB |
|---|---|---|
| **Data Structure** | Structured / Semi-structured (JSONB) | Document (JSON/BSON) |
| **ACID Compliance** | Strong (relational integrity, transactions) | Document-level atomicity, distributed transactions |
| **Read/Write Performance** | Excellent for transactional relational queries | Extremely high throughput for write-heavy workflows |
| **Relational Queries** | Joins are fast, highly native | Expressive aggregation pipelines, but joins (`$lookup`) are expensive |

### Production Recommendation: PostgreSQL
I recommend **PostgreSQL** because:
1.  **Relational Integrity:** Notifications are tightly coupled to users (`users` table) and actions. Tracking read/unread status across millions of users requires consistent join capabilities.
2.  **Rich Querying and Indexing:** PostgreSQL offers powerful indexing (B-Tree, GIN, BRIN) and supports native window functions, which are vital for calculating rankings and partitions.
3.  **JSONB Support:** Offers NoSQL flexibility within a structured database schema.

---

## 2. Database Schema Design (PostgreSQL)

Here is the relational schema design for PostgreSQL:

### A. Notifications Metadata Table
Stores the content and type of the notification.
```sql
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type notification_type NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    priority_score NUMERIC(5, 4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### B. User Notifications Table (User Inbox)
Tracks delivery and read status for individual users.
```sql
CREATE TABLE user_notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

---

## 3. Scaling & Partitioning Strategy

### A. Database Partitioning
For high volumes (millions of users receiving multiple notifications daily), the `user_notifications` table grows exponentially.
*   **Strategy:** Range Partitioning by `delivered_at` (e.g., Monthly partitions).
*   **Why:** Most notification queries targets the last 30 days. Historical partitions can be archived or compressed, while active inserts and reads happen on a small, fast partition.

```sql
-- Partitioned table design
CREATE TABLE user_notifications_partitioned (
    id BIGSERIAL,
    user_id UUID NOT NULL,
    notification_id UUID NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE NOT NULL
) PARTITION BY RANGE (delivered_at);
```

### B. Indexing Strategy
To fetch a user's unread notifications or the prioritized inbox efficiently:
1.  **Composite Index on User Inbox (for reads):**
    ```sql
    CREATE INDEX idx_user_notif_unread 
    ON user_notifications(user_id) 
    WHERE is_read = FALSE;
    ```
    This index is extremely small and ensures instant retrieval of a user's unread counts.
2.  **Index on Priority and Recency (for rankings):**
    ```sql
    CREATE INDEX idx_notif_priority_recency 
    ON notifications(priority_score DESC, timestamp DESC);
    ```

---

## 4. Example SQL Queries

### A. Fetch a User's Unread Prioritized Inbox (Top 10)
This query retrieves notifications for a user, sorted by the pre-calculated `priority_score` (combining type weight and recency).
```sql
SELECT n.id, n.type, n.message, n.timestamp, n.priority_score, un.is_read
FROM user_notifications un
JOIN notifications n ON un.notification_id = n.id
WHERE un.user_id = '00a5daff-fb00-4ed1-88e8-dcd1fa47aa3d'::uuid
  AND un.is_read = FALSE
ORDER BY n.priority_score DESC, n.timestamp DESC
LIMIT 10;
```

### B. Bulk Ingest User Notifications (Batch Dispatch)
Dispatches a notification to multiple users simultaneously.
```sql
INSERT INTO user_notifications (user_id, notification_id, delivered_at)
VALUES 
  ('00a5daff-fb00-4ed1-88e8-dcd1fa47aa3d'::uuid, '82f8cc15-a186-4987-b381-627c08970e0e'::uuid, NOW()),
  ('9a0d2f09-b695-46ff-a5bd-6238b7201c10'::uuid, '82f8cc15-a186-4987-b381-627c08970e0e'::uuid, NOW());
```
