// express-rate-limit store backed by Redis, so limits hold across several API instances.
// Falls back to the library's in-memory store when REDIS_URL is not set.
export class RedisRateStore {
  constructor(redis, prefix) {
    this.redis = redis;
    this.prefix = prefix;
  }
  init(options) {
    this.windowMs = options.windowMs;
  }
  async increment(key) {
    const k = this.prefix + key;
    const [[, hits], [, ttl]] = await this.redis.multi().incr(k).pttl(k).exec();
    if (ttl < 0) await this.redis.pexpire(k, this.windowMs);
    return { totalHits: Number(hits), resetTime: new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs)) };
  }
  async decrement(key) {
    await this.redis.decr(this.prefix + key);
  }
  async resetKey(key) {
    await this.redis.del(this.prefix + key);
  }
}
