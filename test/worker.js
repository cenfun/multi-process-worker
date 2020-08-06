const workerHandler = require("./handler.js");

//event send from mater
process.on("message", async (message) => {
    if (message.type === "workerStart") {
        const workerOption = message.data;
        console.log(workerOption);
        process.send({
            type: "workerOnline"
        });
        return;
    }
    if (message.type === "jobStart") {
        const job = message.data;
        job.code = await workerHandler(job);
        process.send({
            type: "jobFinish",
            data: job
        });
        
    }
});
