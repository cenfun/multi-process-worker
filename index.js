const os = require("os");
const child_process = require('child_process');
const ConsoleGrid = require("console-grid");
//'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'
const CGS = ConsoleGrid.Style;
const consoleGrid = new ConsoleGrid();

const output = (option, msg, color) => {
    if (typeof(option.log) === "function") {
        option.log(option, msg, color);
        return;
    }
    const name = option.name || "MPW";
    const prefix = CGS.magenta("[" + name + "]");
    if (color) {
        let fn = CGS[color];
        if (typeof(fn) === "function") {
            msg = fn(msg);
        }
    }
    const str = prefix + " " + msg;
    console.log(str);
};

const toGB = (num) => {
    let m = num / 1024 / 1024 / 1024;
    let str = m.toFixed(1) + " GB";
    return str;
};

//=================================================================================

const killWorkerItem = (option, item) => {
    item.workingJob = null;
    if (item.worker) {
        item.worker.removeAllListeners();
        item.worker.kill();
        item.worker = null;
        output(option, "worker " + item.workerId + " was " + CGS.green("closed"));
    }
};

const close = (option) => {

    clearTimeout(option.timeout_online);
    clearTimeout(option.timeout_send);

    for (let workerId in option.workers) {
        let item = option.workers[workerId];
        killWorkerItem(option, item);
    }

    output(option, "all workers were closed");

    //close multiple times
    clearTimeout(option.timeout_kill);
    //timeout for kill workers end, sometimes failed
    option.timeout_kill = setTimeout(() => {
        let resolve = option.resolve;
        delete option.resolve;

        option.time_end = Date.now();
        option.duration = option.time_end - option.time_start;

        resolve(option.code);
    }, 500);
};

//clean workers already finished after all jobs sent
const cleanWorker = (option) => {
    for (let workerId in option.workers) {
        let item = option.workers[workerId];
        if (item.workingJob) {
            continue;
        }
        killWorkerItem(option, item);
    }
};

//=================================================================================

const getFreeItem = (option) => {
    for (let workerId in option.workers) {
        let item = option.workers[workerId];
        if (!item.workingJob) {
            return item;
        }
    }
    return null;
};

const sendJob = (option) => {

    //no job
    if (!option.jobQueue.length) {
        cleanWorker(option);
        return;
    }

    //not free worker
    let item = getFreeItem(option);
    if (!item) {
        //do nothing
        return;
    }

    //require copy job list
    let job = option.jobQueue.shift();
    job.time_start = Date.now();
    job.workerId = item.workerId;

    item.workingJob = job;
    item.worker.send({
        type: "jobStart",
        data: job
    });

    //all jobs sent
    if (!option.jobQueue.length) {
        output(option, "all jobs sent", "green");
        cleanWorker(option);
        return;
    }

    //send next
    startJob(option);

};

const startJob = (option) => {
    clearTimeout(option.timeout_send);
    option.timeout_send = setTimeout(() => {
        sendJob(option);
    }, 100);
};

//=================================================================================

const workerOnlineHandler = (option, workerId, worker) => {
    //keep worker to list
    option.workers[workerId] = {
        workerId: workerId,
        time_start: Date.now(),
        jobIdList: [],
        workingJob: null,
        worker: worker
    };
    output(option, "worker " + workerId + " is " + CGS.green("online"));
    let onlineLength = Object.keys(option.workers).length;
    if (onlineLength >= option.workerLength) {
        clearTimeout(option.timeout_online);
        let cost = (Date.now() - option.time_start).toLocaleString();
        output(option, "all workers are online (" + option.workerLength + ") and cost " + cost + "ms");
    }
    startJob(option);
};

const workerOnlineTimeoutHandler = (option) => {
    let onlineLength = Object.keys(option.workers).length;
    if (!onlineLength) {
        output(option, option.onlineTimeout + "ms timeout to create any workers", "red");
        option.code = 1;
        close(option);
        return;
    }
    //parts online
    let status = "online " + onlineLength + " / total " + option.workerLength;
    output(option, option.onlineTimeout + "ms timeout to create workers: " + status, "yellow");
    output(option, "The host could NOT have enough CPU/Memory capacity for running more workers quickly.");
};

//=================================================================================

const getJobById = (option, jobId) => {
    if (jobId) {
        let list = option.jobList;
        for (let i = 0, l = list.length; i < l; i++) {
            let job = list[i];
            if (job && job.jobId === jobId) {
                return job;
            }
        }
    }
    return null;
};

const logCost = (option) => {
    if (!option.logCost) {
        return;
    }

    let columns = [{
        id: "name",
        name: "Name: " + option.name,
        maxWidth: 100,
    }, {
        id: "duration",
        name: "Duration",
        align: "right",
        formatter: function(v) {
            return v.toLocaleString() + " ms";
        }
    }];

    if (option.failFast) {
        columns.push({
            id: "code",
            name: "Code",
            align: "right"
        });
    }

    let rows = [];
    for (let workerId in option.workers) {
        let item = option.workers[workerId];
        if (!item) {
            continue;
        }
        let subs = [];
        item.jobIdList.forEach(jobId => {
            let job = getJobById(option, jobId);
            if (job) {
                subs.push({
                    name: "job " + jobId + " - " + job.name,
                    duration: job.duration,
                    code: job.code
                });
            }
        });
        rows.push({
            name: "worker " + item.workerId,
            duration: item.duration,
            code: "",
            subs: subs
        });
    }
    consoleGrid.render({
        option: {},
        columns: columns,
        rows: rows
    });

};

//job finish handler
const jobFinishHandler = (option, message) => {

    //check job from worker
    let workerJob = message.data;
    if (!workerJob) {
        output(option, "invalid job info sent from worker", "red");
        return;
    }

    //check worker
    let workerId = workerJob.workerId;
    let item = option.workers[workerId];
    if (!item) {
        output(option, "invalid job workerId " + workerId, "red");
        return;
    }

    //check job on master
    let job = item.workingJob;
    item.workingJob = null;

    let jobId = job.jobId;

    //keep master job id as finished job
    item.jobIdList.push(jobId);
    item.time_end = Date.now();
    item.duration = item.time_end - item.time_start;

    //merge worker job back to master job
    job = Object.assign(job, workerJob);

    //rquired property, do NOT merge by worker job info
    job.jobId = jobId;
    job.time_end = Date.now();
    job.duration = job.time_end - job.time_start;

    option.jobFinished += 1;

    //has job error
    if (job.code !== 0) {
        option.jobFailed += 1;

        if (job.exitError) {
            option.exitError = job.exitError;
        }

        if (option.failFast) {
            //finish fast handler
            let cost = (Date.now() - option.time_start).toLocaleString();
            output(option, "finish jobs (" + option.jobFinished + "/" + option.jobLength + ") and cost " + cost + "ms");

            output(option, "failFast: " + option.failFast);
            output(option, "job " + job.jobId + " failed and all worker will be closed ... ");

            //stop/close/kill all jobs
            option.code = job.code;
            close(option);
            return;
        }
    }

    //job done, free workingJob
    if (option.jobFinished >= option.jobLength) {
        //finish all handler

        let cost = (Date.now() - option.time_start).toLocaleString();
        output(option, "finish all jobs (" + option.jobLength + ") and cost " + cost + "ms", "green");

        option.code = option.jobFailed;
        close(option);

        //after close, close is async resolve
        logCost(option);

        return;
    }

    //send next job
    startJob(option);

};

//=================================================================================

const getExecArgv = (option) => {
    //console.log("master", process.execArgv, process.debugPort);

    //https://github.com/nodejs/node/blob/master/lib/internal/cluster/master.js
    const [minPort, maxPort] = [1024, 65535];
    const debugArgRegex = /--inspect(?:-brk|-port)?|--debug-port/;
    let execArgv = process.execArgv.slice();
    if (execArgv.some((arg) => arg.match(debugArgRegex))) {
        let inspectPort = process.debugPort + option.debugPortOffset;
        if (inspectPort > maxPort) {
            inspectPort = inspectPort - maxPort + minPort - 1;
        }
        option.debugPortOffset += 1;
        execArgv.push('--inspect-port=' + inspectPort);

        //console.log("execArgv", execArgv);
        return execArgv;
    }

};

const createWorker = async (option, workerId) => {

    const options = {};
    const execArgv = getExecArgv(option);
    if (execArgv) {
        options.execArgv = execArgv;
    }

    let worker = child_process.fork(option.workerEntry, options);

    //from worker send
    worker.on('message', (message) => {
        if (message.type === "workerOnline") {
            workerOnlineHandler(option, workerId, worker);
            return;
        }
        if (message.type === "jobFinish") {
            jobFinishHandler(option, message);
        }
    });

    //require workerId
    let workerOption = Object.assign({}, option.workerOption, {
        workerId: workerId
    });

    worker.send({
        type: "workerStart",
        data: workerOption
    });

};


const startWorkers = async (option) => {

    output(option, "try to create " + option.workerLength + " workers ...");
    option.time_start = Date.now();
    option.workers = {};

    for (let i = 0; i < option.workerLength; i++) {
        createWorker(option, i + 1);
    }

    //timeout for online checking
    option.timeout_online = setTimeout(() => {
        workerOnlineTimeoutHandler(option);
    }, option.onlineTimeout);

    return new Promise((resolve) => {
        option.resolve = resolve;
    });

};

//=================================================================================

const getDefaultOption = () => {
    return {
        name: "MPW",

        workerEntry: '',

        jobList: [],

        //continue or stop execution of the uncompleted jobs after the first job failure
        failFast: false,

        //share global setting from master process
        workerOption: {},

        //other option

        //TODO 30Mins
        jobTimeout: 30 * 60 * 1000,

        //15s
        onlineTimeout: 15 * 1000,

        logCost: true,
        debugPortOffset: 1,

        //events
        onStart: async (option) => {},
        onFinish: async (option) => {},

        //return code
        code: 0

    };
};

const initOption = (option) => {

    option = Object.assign(getDefaultOption(), option);

    //check required option
    if (!option.workerEntry || typeof(option.workerEntry) !== "string") {
        output(option, "require a valid workerEntry: " + option.workerEntry, "red");
        return;
    }
    output(option, "workerEntry: " + option.workerEntry);

    if (!option.jobList || !option.jobList.length) {
        output(option, "require a valid jobList: " + option.jobList, "red");
        return;
    }

    //init job queue
    option.jobQueue = [];
    option.jobList.forEach((job, i) => {
        job.jobId = i + 1;
        job.name = job.name || option.name;
        job.jobName = job.jobName || option.name;
        job.code = 0;
        option.jobQueue.push(job);
    });

    option.jobLength = option.jobQueue.length;
    option.jobFailed = 0;
    option.jobFinished = 0;

    //init worker length
    const rows = [{
        name: "Name",
        value: option.name
    }, {
        name: "Total Jobs",
        value: option.jobLength
    }];

    let workerLength = option.workerLength;

    if (workerLength) {
        output(option, "specified workers: " + workerLength);

        workerLength = Math.min(workerLength, option.jobLength);
        workerLength = Math.max(workerLength, 1);

    } else {

        output(option, "initialize workerLength by the capacity of CPUs");

        const totalCPUs = os.cpus().length;
        rows.push({
            name: "CPU Cores",
            value: totalCPUs
        });

        const totalMem = os.totalmem();
        const totalMemStr = toGB(totalMem);
        rows.push({
            name: "Total Memory",
            value: totalMemStr
        });

        const freeMem = os.freemem();
        const freeMemStr = toGB(freeMem);
        rows.push({
            name: "Free Memory",
            value: freeMemStr
        });

        workerLength = totalCPUs;
        workerLength = Math.min(workerLength, option.jobLength);
        workerLength = Math.max(workerLength, 1);

    }

    option.workerLength = workerLength;
    rows.push({
        name: "Reasonable Workers",
        value: workerLength
    });

    //show info
    consoleGrid.render({
        option: {
            hideHeaders: true
        },
        columns: [{
            id: "name"
        }, {
            id: "value"
        }],
        rows: rows
    });

    return option;
};

const cleanOption = (option) => {
    //remove timeout id
    for (let k in option) {
        if (k.indexOf("timeout_") === 0) {
            delete option[k];
        }
    }
    //console.log(option);
};

const MPW = async (option) => {

    option = initOption(option);
    if (!option) {
        return 1;
    }

    try {
        await option.onStart(option);
        await startWorkers(option);
        cleanOption(option);
        await option.onFinish(option);
    } catch (e) {
        output(option, e, "red");
        return 1;
    }

    return option.code;
};

module.exports = MPW;
