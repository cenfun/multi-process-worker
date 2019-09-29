const MPW = require("../");
const option = {
    name: "MPW",
    workerEntry: 'worker.js',
    workerLength: 2,
    jobList: [{
        name: "job1",
        jobTimeout: 5000
    }, {
        name: "job2"
    }, {
        name: "error-job"
    }, {
        name: "job3"
    }],
    jobTimeout: 10 * 1000,
    failFast: false,
    //logCost: "worker",
    workerOption: {
        property: "value"
    },
    onStart: async (option) => {
        console.log('onStart');
    },
    onFinish: async (option) => {
        console.log('onFinish');
        if (option.code !== 0) {
            console.log(option.name + ': jobs stopped with error: ' + option.code);
        }
        process.exit(option.code);
    }
};
MPW(option);
