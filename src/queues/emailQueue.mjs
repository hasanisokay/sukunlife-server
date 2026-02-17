import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.mjs';

export const emailQueue = new Queue('email-sending', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 1000,
      age: 7 * 24 * 3600,
    },
    removeOnFail: {
      count: 200,
    },
  },
});

export async function addEmailJob(emailType, emailData, options = {}) {
  const job = await emailQueue.add(
    emailType,
    emailData,
    {
      priority: options.priority || 5,
      delay: options.delay || 0,
      ...options,
    }
  );
  
  console.log(`📧 Email job queued: ${emailType} - ${job.id}`);
  return job;
}

export async function getEmailJob(jobId) {
  return await emailQueue.getJob(jobId);
}