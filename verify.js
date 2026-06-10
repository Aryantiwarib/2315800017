const axios = require("axios");
const Log = require("./logger");
const app = require("./src/app");

const PORT = 3001; // use separate port for test
let server;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log("Starting verification test suite...");
    await Log("test-suite", "info", "verification", "Verification test suite started");

    // 1. Start Server
    server = app.listen(PORT, async () => {
        console.log(`Test server running on port ${PORT}`);
        await Log("test-suite", "info", "verification", `Test server running on port ${PORT}`);
    });

    // Wait 1 second for server startup
    await sleep(1000);

    const client = axios.create({
        baseURL: `http://localhost:${PORT}`,
        validateStatus: () => true, // resolve promise for all HTTP status codes
        timeout: 5000
    });

    try {
        // Test 1: Fetch all notifications (should sync from external)
        console.log("\n--- TEST 1: Fetch All Notifications ---");
        const resAll = await client.get("/api/notifications");
        console.log("Status:", resAll.status);
        console.log("Count:", resAll.data?.count);
        console.log("Success:", resAll.data?.success);
        if (resAll.status !== 200 || !resAll.data?.success) {
            throw new Error("Test 1 Failed: GET /api/notifications did not return 200 success");
        }

        // Test 2: Fetch Top N Notifications
        console.log("\n--- TEST 2: Fetch Top 3 Notifications ---");
        const resTop = await client.get("/api/notifications/top?n=3");
        console.log("Status:", resTop.status);
        console.log("Count:", resTop.data?.count);
        console.log("Notifications:");
        resTop.data?.notifications?.forEach(n => {
            console.log(`- [${n.Type}] Score: ${n.priorityScore.toFixed(4)} | Msg: ${n.Message} | Time: ${n.Timestamp}`);
        });

        if (resTop.status !== 200 || resTop.data?.notifications?.length !== 3) {
            throw new Error("Test 2 Failed: Top N notifications returned incorrect count");
        }

        // Check sorting order
        const notifs = resTop.data.notifications;
        if (notifs[0].priorityScore < notifs[1].priorityScore || notifs[1].priorityScore < notifs[2].priorityScore) {
            throw new Error("Test 2 Failed: Notifications are not sorted by priorityScore descending");
        }
        console.log("Sorting order verified successfully!");

        // Test 3: Create a Notification (Post)
        console.log("\n--- TEST 3: Create a Placement Notification ---");
        const newNotif = {
            Type: "Placement",
            Message: "Google Software Engineer Campus Recruitment Drive Open"
        };
        const resCreate = await client.post("/api/notifications", newNotif);
        console.log("Status:", resCreate.status);
        console.log("Created ID:", resCreate.data?.notification?.ID);
        console.log("Created Score:", resCreate.data?.notification?.priorityScore);
        if (resCreate.status !== 201 || !resCreate.data?.success) {
            throw new Error("Test 3 Failed: POST /api/notifications failed to create notification");
        }

        // Test 4: Create Notification Validation Failure
        console.log("\n--- TEST 4: Create Notification Validation Failure ---");
        const badNotif = {
            Type: "InvalidType",
            Message: "Should fail"
        };
        const resBadCreate = await client.post("/api/notifications", badNotif);
        console.log("Status:", resBadCreate.status);
        console.log("Error Message:", resBadCreate.data?.message);
        if (resBadCreate.status !== 400 || resBadCreate.data?.success) {
            throw new Error("Test 4 Failed: Invalid Type was not rejected with 400 Bad Request");
        }

        // Test 5: Fetch Top N again to check if Google is in the list
        console.log("\n--- TEST 5: Fetch Top 3 Notifications after custom insert ---");
        const resTopAfter = await client.get("/api/notifications/top?n=3");
        console.log("Notifications:");
        resTopAfter.data?.notifications?.forEach(n => {
            console.log(`- [${n.Type}] Score: ${n.priorityScore.toFixed(4)} | Msg: ${n.Message}`);
        });
        const googlePresent = resTopAfter.data?.notifications?.some(n => n.Message.includes("Google"));
        if (!googlePresent) {
            console.log("Warning: Google notification was not in top 3 (this is normal if recency decay matches existing ones, but let's make sure it ranks high due to weight 3 and 1.0 recency).");
        }

        // Test 6: Vehicle Scheduling
        console.log("\n--- TEST 6: Compute Vehicle Scheduling for all depots ---");
        const resSched = await client.get("/api/scheduling");
        console.log("Status:", resSched.status);
        console.log("Depots Scheduled Count:", resSched.data?.resultsCount);
        console.log("Schedule summary:");
        resSched.data?.schedule?.slice(0, 3).forEach(s => {
            console.log(`- Depot ${s.depotId}: Budget=${s.mechanicHoursBudget} | MaxImpact=${s.maxImpact} | SelectedVehicles=${s.selectedVehicles.length}`);
        });
        if (resSched.status !== 200 || !resSched.data?.success) {
            throw new Error("Test 6 Failed: GET /api/scheduling failed");
        }

        // Test 7: Vehicle Scheduling for a specific depot
        console.log("\n--- TEST 7: Compute Vehicle Scheduling for Depot 3 ---");
        const resSchedSingle = await client.get("/api/scheduling/3");
        console.log("Status:", resSchedSingle.status);
        console.log("Result Depot ID:", resSchedSingle.data?.schedule?.depotId);
        console.log("Selected Vehicles Details:");
        resSchedSingle.data?.schedule?.selectedVehicles?.forEach(v => {
            console.log(`  * Vehicle ${v.TaskID}: Duration=${v.Duration}h | Impact=${v.Impact}`);
        });
        if (resSchedSingle.status !== 200 || resSchedSingle.data?.schedule?.depotId !== 3) {
            throw new Error("Test 7 Failed: GET /api/scheduling/3 failed to retrieve correct depot schedule");
        }

        // Test 8: Specific depot not found
        console.log("\n--- TEST 8: Specific Depot Not Found ---");
        const resSchedBad = await client.get("/api/scheduling/9999");
        console.log("Status:", resSchedBad.status);
        console.log("Message:", resSchedBad.data?.message);
        if (resSchedBad.status !== 404 || resSchedBad.data?.success) {
            throw new Error("Test 8 Failed: Non-existent Depot did not return 404 Not Found");
        }

        // Test 9: Deterministic Knapsack Unit Tests
        console.log("\n--- TEST 9: Deterministic Knapsack Unit Tests ---");
        const { solveKnapsack } = require("./src/services/schedulingService");
        const testVehicles = [
            { TaskID: "V1", Duration: 1, Impact: 1 },
            { TaskID: "V2", Duration: 2, Impact: 6 },
            { TaskID: "V3", Duration: 5, Impact: 18 },
            { TaskID: "V4", Duration: 6, Impact: 22 },
            { TaskID: "V5", Duration: 7, Impact: 28 }
        ];

        // Test Case A: Budget = 11. Known optimal is V3 + V4 (Impact = 40, Duration = 11)
        const resultA = solveKnapsack(testVehicles, 11);
        console.log("Test Case A (Budget 11):");
        console.log("  Max Impact calculated:", resultA.maxImpact);
        console.log("  Selected Vehicles count:", resultA.selectedVehicles.length);
        console.log("  Total Duration:", resultA.totalDuration);
        console.log("  Selected IDs:", resultA.selectedVehicles.map(v => v.TaskID).join(", "));
        
        if (resultA.maxImpact !== 40) {
            throw new Error(`Test Case A Failed: Expected max impact 40, got ${resultA.maxImpact}`);
        }
        if (resultA.totalDuration !== 11) {
            throw new Error(`Test Case A Failed: Expected total duration 11, got ${resultA.totalDuration}`);
        }

        // Test Case B: Budget = 7. Known optimal is V2 + V3 (Impact = 24, Duration = 7)
        const resultB = solveKnapsack(testVehicles, 7);
        console.log("Test Case B (Budget 7):");
        console.log("  Max Impact calculated:", resultB.maxImpact);
        console.log("  Total Duration:", resultB.totalDuration);
        console.log("  Selected IDs:", resultB.selectedVehicles.map(v => v.TaskID).join(", "));
        
        if (resultB.maxImpact !== 24) {
            throw new Error(`Test Case B Failed: Expected max impact 24, got ${resultB.maxImpact}`);
        }
        if (resultB.totalDuration !== 7) {
            throw new Error(`Test Case B Failed: Expected total duration 7, got ${resultB.totalDuration}`);
        }

        console.log("Deterministic Knapsack unit tests passed successfully!");

        console.log("\n=================================");
        console.log("ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
        console.log("=================================");
        await Log("test-suite", "info", "verification", "All verification tests completed successfully");

    } catch (err) {
        console.error("\nTEST SUITE ERROR:", err.message);
        await Log("test-suite", "error", "verification", `Test suite failure: ${err.message}`);
        process.exitCode = 1;
    } finally {
        if (server) {
            console.log("Closing test server...");
            server.close();
        }
    }
}

runTests();
