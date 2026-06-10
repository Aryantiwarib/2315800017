# Stage 1: REST API & System Design

This document details the REST API design, naming conventions, payload schemas, headers, error responses, and real-time design considerations for the Notification and Vehicle Scheduling systems.

---

## 1. REST API Design and Endpoints

The API conforms to standard RESTful conventions, utilizing appropriate HTTP methods, semantic path structures, and standard HTTP status codes.

### Base URL: `/api`

### Endpoints Overview

| Endpoint | Method | Description | Auth Required |
|---|---|---|---|
| `/notifications` | `GET` | Fetches, ranks, and returns all notifications. | No (Local API) |
| `/notifications/top` | `GET` | Retrieves the Top N prioritized notifications. | No |
| `/notifications` | `POST` | Ingests a new notification and ranks it. | No |
| `/scheduling` | `GET` | Computes optimization schedule for all depots. | Yes (Internal) |
| `/scheduling/:depotId` | `GET` | Computes optimization schedule for a specific depot. | Yes (Internal) |

---

## 2. Request and Response Schemas

### A. Fetch Top N Notifications
*   **Path:** `/api/notifications/top`
*   **Method:** `GET`
*   **Query Parameters:**
    *   `n` (integer, optional) - The number of top notifications to retrieve. Default is `10`.
*   **Headers:**
    *   `Accept: application/json`
*   **Success Response (200 OK):**
    ```json
    {
      "success": true,
      "count": 3,
      "limit": 3,
      "notifications": [
        {
          "ID": "82f8cc15-a186-4987-b381-627c08970e0e",
          "Type": "Placement",
          "Message": "CSX Corporation hiring",
          "Timestamp": "2026-06-09 08:58:05",
          "priorityScore": 3.037,
          "weight": 3,
          "recencyFactor": 0.037
        },
        {
          "ID": "48aff0b2-618e-4c28-a517-82a6f235b2e9",
          "Type": "Result",
          "Message": "End term exams declared",
          "Timestamp": "2026-06-10 11:22:10",
          "priorityScore": 2.8333,
          "weight": 2,
          "recencyFactor": 0.8333
        },
        {
          "ID": "36e36d7e-7ed4-422e-a35e-201ec7b32843",
          "Type": "Event",
          "Message": "cult-fest",
          "Timestamp": "2026-06-09 23:57:49",
          "priorityScore": 1.0714,
          "weight": 1,
          "recencyFactor": 0.0714
        }
      ]
    }
    ```

### B. Ingest Notification
*   **Path:** `/api/notifications`
*   **Method:** `POST`
*   **Headers:**
    *   `Content-Type: application/json`
*   **Request Body Schema:**
    ```json
    {
      "Type": "Placement", // Must be Placement, Result, or Event
      "Message": "Amazon recruitment started",
      "Timestamp": "2026-06-10 12:45:00" // Optional (defaults to current time)
    }
    ```
*   **Success Response (201 Created):**
    ```json
    {
      "success": true,
      "message": "Notification created successfully",
      "notification": {
        "ID": "9a0d2f09-b695-46ff-a5bd-6238b7201c10",
        "Type": "Placement",
        "Message": "Amazon recruitment started",
        "Timestamp": "2026-06-10 12:45:00",
        "priorityScore": 3.992,
        "weight": 3,
        "recencyFactor": 0.992
      }
    }
    ```

### C. Compute Scheduling Results
*   **Path:** `/api/scheduling` or `/api/scheduling/:depotId`
*   **Method:** `GET`
*   **Success Response (200 OK):**
    ```json
    {
      "success": true,
      "resultsCount": 1,
      "schedule": {
        "depotId": 4,
        "mechanicHoursBudget": 97,
        "maxImpact": 128,
        "totalDuration": 95,
        "unusedHours": 2,
        "selectedVehicles": [
          {
            "TaskID": "79f82fb8-3dbf-4c3c-8759-8015d19cddf3",
            "Duration": 1,
            "Impact": 4
          },
          {
            "TaskID": "7f9eb396-9554-47cb-818e-d0428e083d31",
            "Duration": 4,
            "Impact": 8
          }
        ]
      }
    }
    ```

---

## 3. Error Responses

Standard structured error bodies are returned in case of failures:

```json
{
  "success": false,
  "error": {
    "message": "Error details here",
    "status": 400
  }
}
```

*   **400 Bad Request:** Occurs due to validation failure (e.g., missing mandatory body fields, invalid Type parameter, non-integer `n`).
*   **401 Unauthorized:** Invalid or expired auth token for external services. Handled internally by logging retries and refreshing.
*   **404 Not Found:** Occurs when requesting scheduling for a non-existent `depotId` or hit an unregistered endpoint.
*   **500 Internal Server Error:** General unhandled exceptions. Captured by the global error handler middleware and reported.

---

## 4. Real-Time Notification Design

To push notifications to clients instantly, three primary real-time paradigms are evaluated: primary real-time paradigms:

### A. WebSockets (Bidirectional, TCP-based)
*   **Pros:** True bidirectional low-latency communication. Ideal if clients also need to send messages frequently.
*   **Cons:** Higher resource footprint on servers (requires maintaining open connection state). Poor compatibility with HTTP-centric load balancers without custom routing configurations.

### B. Server-Sent Events (SSE - Unidirectional, HTTP-based)
*   **Pros:** Native browser API (`EventSource`), works on standard HTTP/1.1 or HTTP/2, automatically handles reconnection, lightweight, and unidirectional (perfect for notification streams where only the server pushes).
*   **Cons:** Unidirectional only (cannot send client messages back over the same channel).

### C. Web Push Notifications (Standard-based Push)
*   **Pros:** Works even when the application is closed or the user's phone/browser is asleep. Uses service workers.
*   **Cons:** Higher setup complexity (requires VAPID keys, registration, and integration with push services like FCM or APNS).

### Recommended Production Design: Server-Sent Events (SSE)
I recommend **Server-Sent Events (SSE)** for web and desktop clients due to its simplicity, HTTP compatibility, built-in reconnection logic, and low resource overhead. For mobile platforms, this is supplemented with **Web Push Notifications** (via Firebase Cloud Messaging) to wake up background clients.
