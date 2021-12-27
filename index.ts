/**
 * Copyright (C) 2021 PythonCoderAS
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import Deque = require("double-ended-queue");

/**
 * The item type.
 * @private
 */
interface ItemType<T, RT> {
    item: T;
    resolver: (result: RT) => void;
}

/**
 * Implements a priority worker queue.
 *
 * All priorities are supposed to be >=0. This queue will pop the item at the highest priority **first**.
 *
 * The queue has a limit on the number of concurrent operations that can be ran.
 *
 * @property {(item) => Promise} worker The worker function. Must take an item and return a promise.
 * @property {number} concurrency The number of concurrent operations that can be ran.
 */
export default class ConcurrentPriorityWorkerQueue<T, RT> {
    private _map: Map<number, Deque<ItemType<T, RT>>> = new Map();
    private _length: Map<number, number> = new Map();
    private _maxPriority = 0;
    private _running = 0;
    public readonly worker: (item: T) => Promise<RT>;
    public readonly limit: number;

    public constructor(options: {
        worker: (item: T) => Promise<RT>;
        limit?: number;
    }) {
        this.worker = options.worker;
        this.limit = options.limit || 1;
    }

    /**
     * Enqueues an item. Returns a promise with the result.
     * @param item The item to process.
     * @param priority The priority to process at.
     */
    public enqueue(item: T, priority: number): Promise<RT> {
        if (!this._map.has(priority)) {
            this._map.set(priority, new Deque());
            this._length.set(priority, 0);
        }
        this._maxPriority = Math.max(this._maxPriority, priority);
        return new Promise((resolve) => {
            // The reason we do this is that we know it exists due to the check above.
            this._map.get(priority)!.push({ item, resolver: resolve });
            this._length.set(priority, this._length.get(priority)! + 1);
            this._loop();
        });
    }

    public get highestPriority() {
        return this._maxPriority;
    }

    /**
     * Gets whether the queue is empty.
     */
    public isEmpty(): boolean {
        return Array.from(this._length.values()).reduce((a, b) => a + b, 0) === 0;
    }

    public determineNextPosition(priority: number): number {
        if (this._running < this.limit) {
            return 0;
        } else {
            // To get the next position, it will be processed after all the items with the same priority or higher
            // priority than the specified number.
            return (
                Array.from(this._length.entries())
                    // Filter out all the items with lower priority
                    .filter((value) => value[0] >= priority)
                    // Map the key-value pair to the value array's length
                    .map((value) => value[1])
                    // Sum up all the lengths and add 1 to get the next position
                    .reduce((a, b) => a + b, 0) + 1
            );
        }
    }

    public willQueue(): boolean {
        return this._running >= this.limit;
    }

    private _loop(): void {
        if (this._running < this.limit && !this.isEmpty()) {
            const highestPriorityQueue = this._map.get(this._maxPriority)!;
            const item: ItemType<T, RT> | undefined = highestPriorityQueue.shift()
            if (item === undefined) {
                return;
            }
            const newLength = this._length.get(this._maxPriority)! - 1
            this._length.set(this._maxPriority, newLength);
            if (newLength === 0){
                this._maxPriority = Math.max(...Array.from(this._length.keys())
                    .filter((value) => value < this._maxPriority))
            }
            this._running++;
            this.worker(item.item).then((result: RT) => {
                item.resolver(result);
                this._running--;
                this._loop();
            });
        }
    }
}
