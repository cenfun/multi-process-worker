
# Multi Process Worker
![multi-process-worker.png](test/multi-process-worker.png)

* Create multiple child processes as workers for jobs
* Use master process as worker if only one job to do (low performance if create child process)

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
    workerHandler: null,
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
    onMessage: (message, option) => {
        console.log(`================ onMessage: ${message}`);
    },
    onJobStart: (job) => {
        console.log(`${job.jobName}: ${job.jobId} - start ${job.name}`);
    },
    onJobFinish: (job, option) => {
        console.log(`${job.jobName}: ${job.jobId} - finish ${job.name}`, `cost ${job.duration.toLocaleString()}ms`);
        console.log(option.stats);
    },
    onFinish: async (option) => {
        console.log('onFinish');
        if (option.code !== 0) {
            console.log(option.name + ': jobs stopped with error: ' + option.code);
        }
        process.exit(option.code);
    }
};
const code = await MPW(option);
```

```js
//worker.js for child process
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
        job.code = await workerHandler(job, process);
        process.send({
            type: "jobFinish",
            data: job
        });
        return;
    }
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
* workerMessage
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

+ v2.0.5
  - added workerMessage event

+ v2.0.4
  - added stats(percent,elapsedTime,estimatedTime) when job finished

+ v2.0.3
  - fixed output log

+ v2.0.2
  - fixed worker duration if nothing done

+ v2.0.1
  - (API breaking change) do not create child process if only one worker required, replace with workerHandler

+ v1.0.5
  - logCost support worker level only

+ v1.0.4
  - fix jobTimeout

+ v1.0.3
  - add jobTimeout

+ v1.0.2
  - fix min mem