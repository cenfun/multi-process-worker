
# Multi Process Worker

## Install 
```sh
npm install multi-process-worker --save
```
## Usage
```js
//master.js for master process
const MPW = require("multi-process-worker");
const option = {
    name: "MPW",
    workerEntry: 'worker.js',
    workerLength: 2,
    jobList: [{
        name: "job1"
    }, {
        name: "job2"
    }, {
        name: "error-job"
    }, {
        name: "job3"
    }],
    failFast: false,
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
    }
};
MPW(option);
```

```js
//worker.js for child process
process.on('message', (message) => {
    if (!message) {
        return;
    }
    if (message.type === "workerStart") {
       //workerOption
        console.log( message.data);
        //trigger online event
        process.send({
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
            process.send({
                type: "jobFinish",
                data: job
            });
        });
    }
});
```

## Master Events 
* workerStart
* jobStart

## Worker Events
* workerOnline
* jobFinish


## CHANGELOG

+ v1.0.1
  - init