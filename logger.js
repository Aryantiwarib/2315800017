const axios = require("axios");
const authService = require("./src/services/authService");

const VALID_PACKAGES = ["handler", "service", "controller", "middleware", "utils"];

async function Log(stack, level, packageName, message) {
    // 1. Sanitize stack
    const sanitizedStack = stack === "frontend" ? "frontend" : "backend";

    // 2. Sanitize package name
    let sanitizedPackage = packageName.toLowerCase();
    if (!VALID_PACKAGES.includes(sanitizedPackage)) {
        // Map common terms to valid categories
        if (sanitizedPackage.includes("service")) {
            sanitizedPackage = "service";
        } else if (sanitizedPackage.includes("controller")) {
            sanitizedPackage = "controller";
        } else if (sanitizedPackage.includes("middleware") || sanitizedPackage.includes("handler") || sanitizedPackage.includes("router")) {
            sanitizedPackage = "middleware";
        } else if (sanitizedPackage.includes("utils") || sanitizedPackage.includes("heap")) {
            sanitizedPackage = "utils";
        } else {
            sanitizedPackage = "handler";
        }
    }

    // 3. Sanitize message length (max 48 characters constraint)
    let sanitizedMessage = message;
    if (message.length > 48) {
        sanitizedMessage = message.substring(0, 45) + "...";
    }

    let token;
    try {
        token = await authService.getToken();
    } catch (err) {
        console.log("LOGGER_AUTH_ERROR: Failed to retrieve token. Fallback to console log.");
        console.log(`[${level.toUpperCase()}] [${sanitizedStack}/${sanitizedPackage}] - ${sanitizedMessage}`);
        return;
    }

    console.log("TOKEN START:");
    console.log(token.substring(0, 30));

    console.log("TOKEN END:");
    console.log(token.substring(token.length - 30));

    const makeRequest = async (authToken) => {
        return await axios.post(
            "http://4.224.186.213/evaluation-service/logs",
            {
                stack: sanitizedStack,
                level,
                package: sanitizedPackage,
                message: sanitizedMessage
            },
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Content-Type": "application/json"
                },
                timeout: 5000
            }
        );
    };

    try {
        const response = await makeRequest(token);
        console.log(response.data);
    } catch (error) {
        const status = error.response?.status;
        console.log("STATUS:");
        console.log(status);

        console.log("BODY:");
        console.log(error.response?.data);

        // If unauthorized, token might have expired. Clear cache and retry once.
        if (status === 401) {
            console.log("Token invalid/expired. Refreshing token and retrying log...");
            try {
                authService.clearCache();
                const newToken = await authService.getToken();
                const retryResponse = await makeRequest(newToken);
                console.log("Retry Success:", retryResponse.data);
            } catch (retryError) {
                console.log("Retry Failed Status:", retryError.response?.status);
                console.log("Retry Failed Body:", retryError.response?.data);
            }
        }
    }
}

module.exports = Log;