import ConcurrentPriorityWorkerQueue from "./index";
import {assert} from "chai";
import sleep = require("sleep-promise");

async function timeToRun(fn: () => Promise<void>) {
    const start = Date.now();
    await fn();
    return Date.now() - start;
}

describe("Tests", () => {
    it("Empty worker", function () {
        const queue = new ConcurrentPriorityWorkerQueue<number, number>({worker: async (x) => x});
        assert.equal(queue.length, 0, "Queue length is zero");
        assert.equal(queue.determineNextPosition(0), 0, "Next position is 0");
        assert.isFalse(queue.willQueue(), "Will queue is false");
    })
    it("Worker with single concurrency", async function() {
        const queue = new ConcurrentPriorityWorkerQueue<number, number>({worker: async (x) => {
                await sleep(x)
                return 1;
            }});
        const promises: Promise<any>[] = [];
        promises.push((async function () {
            const timePromise = timeToRun(async () => { await queue.enqueue(1000, 0) })
            // While that's running, do some more tests
            assert.equal(queue.length, 0, "Queue length is 0");
            assert.equal(queue.determineNextPosition(0), 1, "Next position is 1");
            assert.isTrue(queue.willQueue(), "Will queue is true");
            const time = await timePromise
            assert.isTrue(time > 1000)
        })())
        promises.push((async function () {
            const timePromise = timeToRun(async () => {await queue.enqueue(5000, 0)})
            // While that's running, do some more tests
            assert.equal(queue.length, 1, "Queue length is 1");
            assert.equal(queue.determineNextPosition(0), 2, "Next position is 2");
            const time = await timePromise
            assert.isTrue(time > 5900)
        })())
        await Promise.all(promises)
    })
    it("Worker with double concurrency", async function() {
        const queue = new ConcurrentPriorityWorkerQueue<number, number>({worker: async (x) => await sleep(x), limit: 2});
        const promises: Promise<any>[] = [];
        promises.push((async function () {
            const timePromise = timeToRun(async () => {await queue.enqueue(1000, 0)})
            // While that's running, do some more tests
            assert.equal(queue.length, 0, "Queue length is 0");
            assert.equal(queue.determineNextPosition(0), 0, "Next position is 0");
            assert.isFalse(queue.willQueue(), "Will queue is false");
            const time = await timePromise
            assert.isTrue(time > 1000)
        })())
        promises.push((async function () {
            const timePromise = timeToRun(async () => {await queue.enqueue(5000, 0)})
            // While that's running, do some more tests
            assert.equal(queue.length, 0, "Queue length is 0");
            assert.equal(queue.determineNextPosition(0), 1, "Next position is 1")
            const time = await timePromise
            assert.isTrue(time > 5000 && time < 5900)
        })())
        await Promise.all(promises)
    })
    it("Worker with single concurrency and different priorities", async function() {
        const data: number[] = [];
        const queue = new ConcurrentPriorityWorkerQueue<number, number>({worker: async (x) => {
                await sleep(x)
                return data.push(x)
            }});
        await Promise.all([[1000, 0], [1500, 0], [2000, 1]].map(async ([time, priority]) => {
            await queue.enqueue(time, priority)
        }))
        assert.deepEqual<number[]>(data, [1000, 2000, 1500], "Data is [1000, 2000, 1500]")
    })
    it("Worker with double concurrency and different priorities", async function() {
        const data: number[] = [];
        const queue = new ConcurrentPriorityWorkerQueue<number, number>({worker: async (x) => {
                await sleep(x)
                return data.push(x)
            }, limit: 2});
        const promises: Promise<any>[] = [];
        promises.push((async function () {
            const timePromise = queue.enqueue(500, 0)
            // While that's running, do some more tests
            assert.equal(queue.length, 0, "Queue length is 0");
            assert.equal(queue.determineNextPosition(0), 0, "Next position is 0");
            assert.isFalse(queue.willQueue(), "Will queue is false");
            await timePromise
        })())
        promises.push((async function () {
            const timePromise = queue.enqueue(1000, 1)
            // While that's running, do some more tests
            assert.equal(queue.length, 0, "Queue length is 0");
            assert.equal(queue.determineNextPosition(0), 1, "Next position is 1")
            assert.equal(queue.determineNextPosition(1), 1, "Next position is 1")
            await timePromise
        })())
        promises.push((async function () {
            const timePromise = queue.enqueue(2000, 0)
            // While that's running, do some more tests
            assert.equal(queue.length, 1, "Queue length is 1");
            assert.equal(queue.determineNextPosition(0), 2, "Next position is 2")
            assert.equal(queue.determineNextPosition(1), 1, "Next position is 1")
            await timePromise
        })())
        promises.push((async function () {
            await queue.enqueue(1500, 1)
        })())
        await Promise.all(promises)
        assert.deepEqual<number[]>(data, [500, 1000, 1500, 2000], "Data is [500, 1000, 1500, 2000]")
    })
})