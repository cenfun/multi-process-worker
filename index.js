const os = require("os");
const EventEmitter = require("events");
const child_process = require("child_process");

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
    const prefix = CGS.magenta(`[${name}]`);
    if (color) {
        const fn = CGS[color];
        if (typeof(fn) === "function") {
            msg = fn(msg);
        }
    }
    const str = `${prefix} ${msg}`;
    console.log(str);
};

const Util = {

    zero: function(s, l = 2) {
        s = `${s}`;
        return s.padStart(l, "0");
    },

    toNum: function(num, toInt) {
        if (typeof(num) !== "number") {
            num = parseFloat(num);
        }
        if (isNaN(num)) {
            num = 0;
        }
        if (toInt) {
            num = Math.round(num);
        }
        return num;
    },

    BF: function(v, digits = 1, base = 1024) {
        v = Util.toNum(v, true);
        if (v === 0) {
            return "0B";
        }
        let prefix = "";
        if (v < 0) {
            v = Math.abs(v);
            prefix = "-";
        }
        const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
        for (let i = 0, l = units.length; i < l; i++) {
            const min = Math.pow(base, i);
            const max = Math.pow(base, i + 1);
            if (v > min && v < max) {
                const unit = units[i];
                v = prefix + (v / min).toFixed(digits) + unit;
                break;
            }
        }
        return v;
    },

    //time
    TF: function(v, unit, digits = 1) {
        v = Util.toNum(v, true);
        if (unit) {
            if (unit === "s") {
                v = (v / 1000).toFixed(digits);
            } else if (unit === "m") {
                v = (v / 1000 / 60).toFixed(digits);
            } else if (unit === "h") {
                v = (v / 1000 / 60 / 60).toFixed(digits);
            }
            return Util.NF(v) + unit;
        }
        const s = v / 1000;
        const hours = Math.floor(s / 60 / 60);
        const minutes = Math.floor((s - (hours * 60 * 60)) / 60);
        const seconds = Math.round(s - (hours * 60 * 60) - (minutes * 60));
        return `${hours}:${Util.zero(minutes)}:${Util.zero(seconds)}`;
    },

    //duration time
    DTF: function(v, maxV) {
        maxV = maxV || v;
        if (maxV > 60 * 1000) {
            return Util.TF(v);
        }
        return Util.TF(v, "ms");
    },

    //number
    NF: function(v) {
        v = Util.toNum(v);
        return v.toLocaleString();
    }

};
//=================================================================================

const killWorkerItem = (option, item) => {
    item.workingJob = null;
    if (item.timeout_job) {
        clearTimeout(item.timeout_job);
        item.timeout_job = null;
    }
    const worker = item.worker;
    if (worker) {
        item.worker = null;
        worker.removeAllListeners();
        const killed = worker.kill("SIGKILL");
        output(option, `worker ${item.workerId} was killed: ${killed}`);
    }
};

const close = (option) => {

    clearTimeout(option.timeout_online);
    clearTimeout(option.timeout_send);

    for (const workerId in option.workers) {
        const item = option.workers[workerId];
        killWorkerItem(option, item);
    }

    output(option, "all workers were closed");

    //close multiple times
    clearTimeout(option.timeout_kill);
    //timeout for kill workers end, sometimes failed
    option.timeout_kill = setTimeout(() => {
        const resolve = option.resolve;
        delete option.resolve;

        option.time_end = Date.now();
        option.duration = option.time_end - option.time_start;

        resolve(option.code);
    }, 500);
};

//clean workers already finished after all jobs sent
const cleanWorker = (option) => {
    for (const workerId in option.workers) {
        const item = option.workers[workerId];
        if (item.workingJob) {
            continue;
        }
        killWorkerItem(option, item);
    }
};

//=================================================================================

const getFreeItem = (option) => {
    for (const workerId in option.workers) {
        const item = option.workers[workerId];
        if (!item.workingJob) {
            return item;
        }
    }
    return null;
};

const sendJob = async (option) => {

    //no job
    if (!option.jobQueue.length) {
        cleanWorker(option);
        return;
    }

    //not free worker
    const item = getFreeItem(option);
    if (!item) {
        //do nothing
        return;
    }

    //require copy job list
    const job = option.jobQueue.shift();
    job.time_start = Date.now();
    job.workerId = item.workerId;
    await option.onJobStart(job, option);

    item.workingJob = job;

    //job timeout
    if (item.timeout_job) {
        clearTimeout(item.timeout_job);
    }
    const jobTimeout = job.jobTimeout || option.jobTimeout;
    item.timeout_job = setTimeout(() => {
        const jobInfo = `[worker${job.workerId}] [job${job.jobId}] ${job.name}`;
        output(option, `${jobTimeout}ms timeout: ${jobInfo}`, "red");
        option.code = 1;
        close(option);
    }, jobTimeout);

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
    const item = {
        workerId: workerId,
        time_start: option.time_start,
        time_end: Date.now(),
        jobIdList: [],
        workingJob: null,
        worker: worker
    };
    item.duration = item.time_end - item.time_start;
    option.workers[workerId] = item;

    output(option, `worker ${workerId} is ${CGS.green("online")}`);
    const onlineLength = Object.keys(option.workers).length;
    if (onlineLength >= option.workerLength) {
        clearTimeout(option.timeout_online);
        const cost = Date.now() - option.time_start;
        output(option, `all workers are online (${option.workerLength}) and cost ${Util.DTF(cost)}`);
    }
    startJob(option);
};

const workerOnlineTimeoutHandler = (option) => {
    const onlineLength = Object.keys(option.workers).length;
    if (!onlineLength) {
        output(option, `${option.onlineTimeout}ms timeout to create any workers`, "red");
        option.code = 1;
        close(option);
        return;
    }
    //parts online
    const status = `online ${onlineLength} / total ${option.workerLength}`;
    output(option, `${option.onlineTimeout}ms timeout to create workers: ${status}`, "yellow");
    output(option, "The host could NOT have enough CPU/Memory capacity for running more workers quickly.");
};

//=================================================================================

const workerMessageHandler = (option, message) => {
    option.onMessage(message.data, option);
};

//=================================================================================

const getJobById = (option, jobId) => {
    if (jobId) {
        const list = option.jobList;
        for (let i = 0, l = list.length; i < l; i++) {
            const job = list[i];
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

    let maxDuration = 0;

    const columns = [{
        id: "name",
        name: `Name: ${option.name}`,
        maxWidth: 100
    }, {
        id: "duration",
        name: "Duration",
        align: "right",
        formatter: function(v) {
            return Util.DTF(v, maxDuration);
        }
    }];

    if (option.failFast && option.logCost !== "worker") {
        columns.push({
            id: "code",
            name: "Code",
            align: "right"
        });
    } else if (option.logCost === "worker") {
        columns.push({
            id: "jobs",
            name: "Jobs",
            align: "right"
        });
    }

    const rows = [];
    for (const workerId in option.workers) {
        const item = option.workers[workerId];
        if (!item) {
            continue;
        }
        const workerRow = {
            name: `worker ${item.workerId}`,
            duration: item.duration,
            code: ""
        };
        maxDuration = Math.max(maxDuration, item.duration);
        rows.push(workerRow);
        if (option.logCost === "worker") {
            workerRow.jobs = item.jobIdList.length;
            continue;
        }

        const subs = [];
        item.jobIdList.forEach(jobId => {
            const job = getJobById(option, jobId);
            if (job) {
                subs.push({
                    name: `job ${jobId} - ${job.name}`,
                    duration: job.duration,
                    code: job.code
                });
            }
        });
        const sl = subs.length;
        if (sl > 6) {
            subs.length = 5;
            subs.push({
                name: `(...and ${sl - 5} more)`
            });
        }
        workerRow.subs = subs;

    }
    consoleGrid.render({
        option: {},
        columns: columns,
        rows: rows
    });

};

const updateStats = (option) => {
    if (!option.stats) {
        option.stats = {};
    }
    const stats = option.stats;
    
    const total = option.jobLength;
    const done = option.jobFinished;
    const todo = total - done;

    stats.jobTotal = total;
    stats.jobDone = done;
    stats.jobTodo = todo;
    
    const percent = done / total;
    stats.percent = percent;
    
    const elapsedTime = Date.now() - option.time_start;
    stats.elapsedTime = elapsedTime;
    
    const estimatedTime = Math.round(elapsedTime / done * todo);
    stats.estimatedTime = estimatedTime;

    //human-readable
    stats.percentH = `${(percent * 100).toFixed(2)}%`;
    const max = Math.max(elapsedTime, estimatedTime);
    stats.elapsedTimeH = Util.DTF(elapsedTime, max);
    stats.estimatedTimeH = Util.DTF(estimatedTime, max);
};

//job finish handler
const jobFinishHandler = async (option, message) => {

    //check job from worker
    const workerJob = message.data;
    if (!workerJob) {
        output(option, "invalid job info sent from worker", "red");
        return;
    }

    //check worker
    const workerId = workerJob.workerId;
    const workerItem = option.workers[workerId];
    if (!workerItem) {
        output(option, `invalid job workerId ${workerId}`, "red");
        return;
    }

    clearTimeout(workerItem.timeout_job);
    workerItem.timeout_job = null;

    //check job on master
    let job = workerItem.workingJob;
    workerItem.workingJob = null;

    const jobId = job.jobId;

    //keep master job id as finished job
    workerItem.jobIdList.push(jobId);
    workerItem.time_end = Date.now();
    workerItem.duration = workerItem.time_end - workerItem.time_start;

    //merge worker job back to master job
    job = Object.assign(job, workerJob);

    //required property, do NOT merge by worker job info
    job.jobId = jobId;
    job.time_end = Date.now();
    job.duration = job.time_end - job.time_start;

    option.jobFinished += 1;
    
    updateStats(option);

    await option.onJobFinish(job, option);

    //has job error
    if (job.code !== 0) {
        option.jobFailed += 1;

        if (job.exitError) {
            option.exitError = job.exitError;
        }

        if (option.failFast) {
            //finish fast handler
            const cost = Date.now() - option.time_start;
            output(option, `finish jobs (${option.jobFinished}/${option.jobLength}) and cost ${Util.DTF(cost)}`);

            output(option, `failFast: ${option.failFast}`);
            output(option, `job ${job.jobId} failed and all worker will be closed ... `);

            //stop/close/kill all jobs
            option.code = job.code;
            close(option);
            return;
        }
    }

    //job done, free workingJob
    if (option.jobFinished >= option.jobLength) {
        //finish all handler

        const cost = Date.now() - option.time_start;
        output(option, `finish all jobs (${option.jobLength}) and cost ${Util.DTF(cost)}`, "green");

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
class MasterWorker extends EventEmitter {

    constructor(workerHandler) {
        super();
        this.on("message", async (message) => {
            if (message.type === "workerStart") {
                this.send({
                    type: "workerOnline"
                });
                return;
            }
            if (message.type === "jobStart") {
                const job = message.data;
                job.code = await workerHandler(job, this);
                this.send({
                    type: "jobFinish",
                    data: job
                });
            }
        });
    }

    send(data) {
        this.emit("message", data);
    }

    kill() {
        this.killed = true;
        return true;
    }
}

//==================================================================================================

const workerInitEvents = (option, workerId, worker) => {
    //from worker send
    worker.on("message", (message) => {
        if (message.type === "workerOnline") {
            workerOnlineHandler(option, workerId, worker);
            return;
        }
        if (message.type === "workerMessage") {
            workerMessageHandler(option, message);
            return;
        }
        if (message.type === "jobFinish") {
            jobFinishHandler(option, message);
            
        }
    });
};

const workerSendStart = (option, workerId, worker) => {
    //require workerId
    const workerOption = Object.assign({}, option.workerOption, {
        workerId: workerId
    });

    worker.send({
        type: "workerStart",
        data: workerOption
    });
};

//==================================================================================================

const createMasterWorker = (option, workerId) => {
    const worker = new MasterWorker(option.workerHandler);
    workerInitEvents(option, workerId, worker);
    workerSendStart(option, workerId, worker);
};

//==================================================================================================

const getExecArgv = (option) => {
    //console.log("master", process.execArgv, process.debugPort);
    //https://github.com/nodejs/node/blob/master/lib/internal/cluster/master.js
    const [minPort, maxPort] = [1024, 65535];
    const debugArgRegex = /--inspect(?:-brk|-port)?|--debug-port/;
    const execArgv = process.execArgv.slice();
    if (execArgv.some((arg) => arg.match(debugArgRegex))) {
        let inspectPort = process.debugPort + option.debugPortOffset;
        if (inspectPort > maxPort) {
            inspectPort = inspectPort - maxPort + minPort - 1;
        }
        option.debugPortOffset += 1;
        execArgv.push(`--inspect-port=${inspectPort}`);
        //console.log("execArgv", execArgv);
        return execArgv;
    }
};

const createChildWorker = (option, workerId) => {
    const options = {};
    const execArgv = getExecArgv(option);
    if (execArgv) {
        options.execArgv = execArgv;
    }
    const worker = child_process.fork(option.workerEntry, options);
    workerInitEvents(option, workerId, worker);
    workerSendStart(option, workerId, worker);
};

//==================================================================================================

const startWorkers = (option) => {

    option.workers = {};

    if (option.workerHandler && option.workerLength < 2) {
        output(option, "use master process as worker 1");
        createMasterWorker(option, 1);
    } else {
        output(option, `try to create ${option.workerLength} workers ...`);
        for (let i = 0; i < option.workerLength; i++) {
            createChildWorker(option, i + 1);
        }
        //timeout for online checking
        option.timeout_online = setTimeout(() => {
            workerOnlineTimeoutHandler(option);
        }, option.onlineTimeout);
    }

    return new Promise((resolve) => {
        option.resolve = resolve;
    });

};

//=================================================================================

const getDefaultOption = () => {
    return {
        name: "MPW",

        workerEntry: "",
        workerHandler: null,

        jobList: [],

        //continue or stop execution of the uncompleted jobs after the first job failure
        failFast: false,

        //share global setting from master process
        workerOption: {},

        //other option

        //30Mins
        jobTimeout: 30 * 60 * 1000,

        //15s
        onlineTimeout: 15 * 1000,

        //true, false, worker
        logCost: true,
        debugPortOffset: 1,

        //events
        onStart: async (option) => {},
        onMessage: async (message, option) => {},
        onJobStart: async (job, option) => {},
        onJobFinish: async (job, option) => {},
        onFinish: async (option) => {},

        //return code
        code: 0

    };
};

const initOption = (option) => {

    option = Object.assign(getDefaultOption(), option);
    option.time_start = Date.now();

    //check required option
    if (!option.workerEntry || typeof(option.workerEntry) !== "string") {
        output(option, `require a valid workerEntry: ${option.workerEntry}`, "red");
        return;
    }
    output(option, `workerEntry: ${option.workerEntry}`);

    if (!option.jobList || !option.jobList.length) {
        output(option, `require a valid jobList: ${option.jobList}`, "red");
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
        output(option, `specified workers: ${workerLength}`);

        workerLength = Math.min(workerLength, option.jobLength);
        workerLength = Math.max(workerLength, 1);

    } else {

        output(option, "initialize workerLength by the capacity of CPUs");

        const totalCPUs = os.cpus().length;
        rows.push({
            name: "CPU Cores",
            value: totalCPUs
        });

        const freeMem = os.freemem();
        const freeMemStr = Util.BF(freeMem);
        rows.push({
            name: "Free Memory",
            value: freeMemStr
        });

        const totalMem = os.totalmem();
        const totalMemStr = Util.BF(totalMem);
        rows.push({
            name: "Total Memory",
            value: totalMemStr
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
    for (const k in option) {
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
