const workerHandler = (job, worker) => {

    return new Promise((resolve) => {

        worker.send({
            type: "workerMessage",
            data: "This is message before job start"
        });

        if (job.name === "error-job") {
            setTimeout(() => {
                console.log("test failed job");
                resolve(1);
            }, 1000);
            return;
        }

        worker.send({
            type: "workerMessage",
            data: "This is message before job resolve"
        });

        setTimeout(() => {
            resolve(0);
        }, 3000);

    });
};

module.exports = workerHandler;
