# Stage 6: Priority Inbox & Heap Efficiency

This document details the algorithm, mathematical models, data structures, and complexity analysis for the Priority Inbox implementation.

---

## 1. Priority Score Calculation

The Priority Score determines the ordering of notifications in a user's inbox, combining static category weights with a dynamic recency decay factor.

$$\text{Priority Score} = \text{Notification Type Weight} + \text{Recency Factor}$$

### A. Notification Type Weights
Category weights are assigned according to business priority:
*   **Placement:** Weight = `3` (Critical, time-sensitive)
*   **Result:** Weight = `2` (Important)
*   **Event:** Weight = `1` (Informational)

### B. Recency Factor (Decay Formula)
To prevent older notifications from dominating the top of the inbox, we calculate a decay factor that converges to 0 as time increases:

$$\text{Recency Factor} = \frac{1}{1 + \text{Age in Hours}}$$

*   **Age = 0 (Created just now):** Recency Factor = $1 / (1 + 0) = 1.0$ (Max priority boost)
*   **Age = 1 Hour:** Recency Factor = $1 / (1 + 1) = 0.5$
*   **Age = 24 Hours:** Recency Factor = $1 / (1 + 24) = 0.04$
*   **Age = 100 Hours:** Recency Factor = $1 / (1 + 100) \approx 0.01$ (Min boost)

---

## 2. Min-Heap Priority Queue for Top N

A naive approach to get the top N items is to retrieve all $M$ notifications, sort them in descending order, and take the first $N$.
*   **Naive Complexity:** $O(M \log M)$ time, where $M$ is the total number of notifications.
*   **Inefficiency:** If $M$ is large (e.g. 100,000) and $N$ is small (e.g. 10), sorting the entire list is extremely wasteful.

### The Min-Heap Approach (Chosen Implementation)
A **Min-Heap** is maintained of fixed size $N$**:
1.  **Ingestion:** The system iterates through the $M$ notifications. For each notification:
    *   If the heap size is $< N$, insert the item. Complexity: $O(\log N)$.
    *   If the heap size is $N$, compare the item's score with the heap's root (which is the minimum score in our current Top N).
        *   If the item's score is greater than the root score, remove the root and insert the new item. Complexity: $O(\log N)$.
        *   Otherwise, discard the item. Complexity: $O(1)$.
2.  **Retrieval:** The heap contains exactly the top $N$ items. All items are extracted to get them in sorted order. Complexity: $O(N \log N)$.

### Complexity Summary:
*   **Insertion Time Complexity:** $O(\log N)$ per item, totaling $O(M \log N)$ for $M$ items. Since $N \ll M$, this is highly optimal.
*   **Retrieval Time Complexity:** $O(N \log N)$ (since $N$ is small, this executes in fractions of a millisecond).
*   **Space Complexity:** $O(N)$ (requires storing only $N$ elements in memory).

---

## 3. Min-Heap Implementation Snippet

Below is the core structure of the implemented Min-Heap bubble-up and bubble-down logic used in `src/utils/MinHeap.js`:

```javascript
bubbleUp(index) {
    let currentIndex = index;
    let parentIndex = this.getParentIndex(currentIndex);

    while (currentIndex > 0 && this.heap[currentIndex].score < this.heap[parentIndex].score) {
        this.swap(currentIndex, parentIndex);
        currentIndex = parentIndex;
        parentIndex = this.getParentIndex(currentIndex);
    }
}

bubbleDown(index) {
    let currentIndex = index;
    let leftIndex = this.getLeftChildIndex(currentIndex);
    let rightIndex = this.getRightChildIndex(currentIndex);
    let smallestIndex = currentIndex;
    const len = this.heap.length;

    if (leftIndex < len && this.heap[leftIndex].score < this.heap[smallestIndex].score) {
        smallestIndex = leftIndex;
    }
    if (rightIndex < len && this.heap[rightIndex].score < this.heap[smallestIndex].score) {
        smallestIndex = rightIndex;
    }
    if (smallestIndex !== currentIndex) {
        this.swap(currentIndex, smallestIndex);
        this.bubbleDown(smallestIndex);
    }
}
```
This custom heap class enables continuous stream ingestion with absolute guarantees on memory boundaries and operational complexity.
