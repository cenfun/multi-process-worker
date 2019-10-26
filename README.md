
# Multi Process Worker
![multi-process-worker.png](test/multi-process-worker.png)

* Create multiple child processes as workers for jobs
* Use master process as worker if only one job to do (create child process cost performance)

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
const code = await MPW.Master(option);
```

```js
//worker.js for child process
const MPW = require("multi-process-worker");
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
        }

    });
});
```

## Test
```
npm run test
```

## Master Events 
* workerStart
* jobStart

## Worker Events
* workerOnline
* jobFinish

## Debug child process with VSCode
```js
{
    "version": "0.2.0",
    "configurations": [{
        "type": "node",
        "request": "launch",
        "name": "Launch Program",
        "autoAttachChildProcesses": true,
        "cwd": "${workspaceFolder}/test",
        "program": "${workspaceFolder}/test/master.js"
    }]
}
```

## CHANGELOG

+ v2.0.0
  - (API breaking change) do not create child process if only one worker required 

+ v1.0.5
  - logCost support worker level only

+ v1.0.4
  - fix jobTimeout

+ v1.0.3
  - add jobTimeout

+ v1.0.2
  - fix min mem