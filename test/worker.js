const MPW = require("../");

let workerOption;

let jobHandler = async (job) => {
    console.log("job start ..." + job.name);

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


MPW.Worker((worker) => {
    //event send from mater
    worker.on('message', (message) => {
        if (!message) {
            return;
        }

        //set worker option
        if (message.type === "workerStart") {
            workerOption = message.data;

            console.log(workerOption);
            //trigger online event
            worker.send({
                type: "workerOnline"
            });
            return;
        }

        //start job
        if (message.type === "jobStart") {
            var job = message.data;
            var jobStartTime = Date.now();
            jobHandler(job).then((exitCode) => {
                job.code = exitCode;
                var cost = (Date.now() - jobStartTime).toLocaleString();
                console.log("finish job and cost " + cost + "ms");
                //finish job
                worker.send({
                    type: "jobFinish",
                    data: job
                });
            });
            return;
        }

    });
});
