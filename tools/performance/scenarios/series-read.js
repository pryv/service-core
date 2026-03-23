/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
import { Client, runConcurrent } from '../lib/client.js';

/**
 * Benchmark: HF series read
 * GET /{username}/events/{eventId}/series with time ranges.
 */
export async function run (config, seedData) {
  console.log('  Running series-read...');

  const results = await runConcurrent(
    async (idx) => {
      const user = seedData.users[idx % seedData.users.length];
      const client = new Client(config.hfsTarget, user.masterToken);

      if (!user.seriesEventIds || user.seriesEventIds.length === 0) {
        return { elapsed: 0, error: 'no series events seeded' };
      }

      const eventId = user.seriesEventIds[idx % user.seriesEventIds.length];

      // query full range
      const res = await client.get(
        `/${user.username}/events/${eventId}/series?fromDeltaTime=0&toDeltaTime=${Date.now() / 1000}`
      );

      return {
        elapsed: res.elapsed,
        error: res.ok ? null : `HTTP ${res.status}: ${res.body?.error?.message || 'unknown'}`
      };
    },
    { concurrency: config.concurrency, durationMs: config.duration * 1000 }
  );

  return { subScenario: 'series-read', results };
}
