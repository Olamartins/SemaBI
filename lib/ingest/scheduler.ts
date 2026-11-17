import { currentPeriod } from "../util.ts";

export interface ScheduledJob {
  name: string;
  schedule: string; // "HH:MM" UTC
  run: () => Promise<void>;
  cancel: () => void;
}

function parseSchedule(schedule: string): { h: number; m: number } {
  const m = /^(\d{2}):(\d{2})$/.exec(schedule);
  if (!m) throw new Error(`Invalid schedule '${schedule}', expected HH:MM`);
  return { h: Number(m[1]), m: Number(m[2]) };
}

/**
 * In-process daily scheduler (demo / single-instance). In prod with REDIS_URL set,
 * jobs are registered with BullMQ instead (see registerBullMqJobs).
 */
export function scheduleDaily(name: string, schedule: string, run: () => Promise<void>): ScheduledJob {
  const { h, m } = parseSchedule(schedule);
  let lastRunKey = "";
  let cancelled = false;
  const timer = setInterval(() => {
    if (cancelled) return;
    const now = new Date();
    if (now.getUTCHours() === h && now.getUTCMinutes() === m) {
      const key = `${currentPeriod()}-${h}:${m}`;
      if (key === lastRunKey) return; // run at most once per scheduled minute
      lastRunKey = key;
      run().catch((err) => console.error(`[scheduler] job '${name}' failed:`, err));
    }
  }, 15_000);
  timer.unref?.();
  return {
    name,
    schedule,
    run,
    cancel: () => {
      cancelled = true;
      clearInterval(timer);
    },
  };
}

/** BullMQ-backed repeatable jobs when Redis is configured (prod). */
export async function registerBullMqJobs(jobs: { name: string; schedule: string; run: () => Promise<void> }[]): Promise<void> {
  if (!process.env.REDIS_URL) return;
  const { Queue, Worker } = await import("bullmq");
  const { Redis } = await import("ioredis");
  const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue("semabi", { connection });
  for (const job of jobs) {
    await queue.add(job.name, {}, { repeat: { pattern: cronFromHHMM(job.schedule) }, removeOnComplete: 50, removeOnFail: 100 });
  }
  new Worker(
    "semabi",
    async (job) => {
      const j = jobs.find((x) => x.name === job.name);
      if (j) await j.run();
    },
    { connection },
  );
}

export function cronFromHHMM(hhmm: string): string {
  const { h, m } = parseSchedule(hhmm);
  return `${m} ${h} * * *`;
}
