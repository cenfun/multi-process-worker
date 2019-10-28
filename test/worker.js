const workerHandler = require("./handler.js");

//event send from mater
process.on('message', async (message) => {
    if (message.type === "workerStart") {
        let workerOption = message.data;
        console.log(workerOption);
        process.send({
            type: "workerOnline"
        });
        return;
    }
    if (message.type === "jobStart") {
        var job = message.data;
        job.code = await workerHandler(job);
        process.send({
            type: "jobFinish",
            data: job
        });
        return;
    }
});
