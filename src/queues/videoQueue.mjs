import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.mjs';

export const videoQueue = new Queue('video-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 100,
      age: 24 * 3600,
    },
    removeOnFail: {
      count: 50,
    },
  },
});

export async function addVideoJob(videoId, jobData) {
  const job = await videoQueue.add(
    'process-video',
    jobData,
    {
      jobId: videoId,
      priority: 1,
    }
  );
  
  console.log(`📹 Video job queued: ${videoId}`);
  return job;
}

export async function getVideoJob(videoId) {
  return await videoQueue.getJob(videoId);
}

export async function cancelVideoJob(videoId) {
  const job = await videoQueue.getJob(videoId);
  if (job) {
    await job.remove();
    console.log(`🚫 Video job cancelled: ${videoId}`);
    return true;
  }
  return false;
}