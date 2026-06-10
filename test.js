const Log = require("./logger");

async function test() {
    const result = await Log(
        "backend",
        "info",
        "handler",
        "testing logger"
    );

    console.log(result);
}

test();