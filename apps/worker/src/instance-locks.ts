import { Redis } from 'ioredis';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

import { createLogger } from '@ravoxzap/logger';

const logger = createLogger({ service: 'worker-locks' });

export class InstanceLockManager {
  private readonly ownerId = `${hostname()}-${process.pid}-${randomUUID()}`;
  private readonly intervals = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly redis: Redis,
    private readonly ttlMs: number,
  ) {}

  private key(instanceId: string) {
    return `wa:instance-lock:${instanceId}`;
  }

  has(instanceId: string) {
    return this.intervals.has(instanceId);
  }

  async ensure(instanceId: string) {
    if (this.has(instanceId)) return;

    const acquired = await this.redis.set(this.key(instanceId), this.ownerId, 'PX', this.ttlMs, 'NX');
    if (acquired !== 'OK') {
      throw new Error(`WhatsApp instance ${instanceId} is currently owned by another worker.`);
    }

    const refreshEvery = Math.max(1000, Math.floor(this.ttlMs / 3));
    const interval = setInterval(() => {
      void this.refresh(instanceId).catch(error => {
        logger.error('Failed to refresh WhatsApp instance lock', {
          instanceId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
    }, refreshEvery);

    this.intervals.set(instanceId, interval);
  }

  async refresh(instanceId: string) {
    const result = await this.redis.eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end',
      1,
      this.key(instanceId),
      this.ownerId,
      String(this.ttlMs),
    );

    if (result !== 1) {
      await this.releaseLocal(instanceId);
      throw new Error(`Lost WhatsApp instance lock for ${instanceId}.`);
    }
  }

  private async releaseLocal(instanceId: string) {
    const interval = this.intervals.get(instanceId);
    if (interval) clearInterval(interval);
    this.intervals.delete(instanceId);
  }

  async release(instanceId: string) {
    await this.releaseLocal(instanceId);
    await this.redis.eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      this.key(instanceId),
      this.ownerId,
    );
  }

  async releaseAll() {
    await Promise.all([...this.intervals.keys()].map(instanceId => this.release(instanceId)));
  }
}
