const workerHandler = (job) => {

    return new Promise((resolve) => {

        if (job.name === "error-job") {
            setTimeout(() => {
                console.log("test failed job");
                resolve(1);
            }, 1000);
            return;
        }

        setTimeout(() => {
            resolve(0);
        }, 3000);

    });
};

module.exports = workerHandler;
