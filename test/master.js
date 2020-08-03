const MPW = require("../");
const workerHandler = require("./handler.js");

const testMultipleJobs = async () => {
    const option = {
        name: "MPW",
        workerEntry: `${__dirname}/worker.js`,
        workerHandler: workerHandler,
        //workerLength: 2,
        jobList: [{
            name: "job1",
            jobTimeout: 5000
        }, {
            name: "job2"
        }, {
            name: "error-job"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }, {
            name: "job3"
        }],
        jobTimeout: 10 * 1000,
        failFast: false,
        //logCost: "worker",
        workerOption: {
            property: "value"
        },
        onStart: (option) => {
            console.log("onStart");
        },
        onJobStart: (job) => {
            console.log(`start ${job.name}`);
        },
        onJobFinish: (job) => {
            console.log(`finish ${job.name} and cost ${job.duration.toLocaleString()}ms`);
        },
        onFinish: (option) => {
            console.log("onFinish");
            if (option.code !== 0) {
                console.log(`${option.name}: jobs stopped with error: ${option.code}`);
            }
        }
    };
    await MPW(option);
};

const testSingleJob = async () => {
    const option = {
        name: "MPW",
        workerEntry: `${__dirname}/worker.js`,
        workerHandler: workerHandler,
        jobList: [{
            name: "job1",
            jobTimeout: 5000
        }],
        onStart: (option) => {
            console.log("onStart");
        },
        onJobStart: (job) => {
            console.log(`start ${job.name}`);
        },
        onJobFinish: (job) => {
            console.log(`finish ${job.name} and cost ${job.duration.toLocaleString()}ms`);
        },
        onFinish: (option) => {
            console.log("onFinish");
            if (option.code !== 0) {
                console.log(`${option.name}: jobs stopped with error: ${option.code}`);
            }
        }
    };
    await MPW(option);
};

const test = async () => {
    console.log("======================================================================");
    console.log("Test Multiple Jobs");
    await testMultipleJobs();

    console.log("======================================================================");
    console.log("Test Single Job");
    await testSingleJob();
};


test();
