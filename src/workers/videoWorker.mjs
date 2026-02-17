import { Worker } from 'bullmq';
import { exec } from 'child_process';
import fs from 'fs';
import { redisConnection } from '../config/redis.mjs';

function formatTime(sec) {
  if (!sec || sec < 0 || !isFinite(sec)) return "calculating...";
  
  if (sec < 60) {
    return `${Math.round(sec)}s`;
  } else if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  } else {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  }
}

export const videoWorker = new Worker(
  'video-processing',
  async (job) => {
    const { videoId, cmd, inputPath, baseDir } = job.data;
    
    console.log(`🎬 Starting FFmpeg for ${videoId}`);
    
    return new Promise((resolve, reject) => {
      let totalDuration = 0;
      let startTime = Date.now();
      let lastUpdateTime = startTime;
      let lastPercent = 0;

      const ff = exec(cmd);

      ff.stderr.on('data', (data) => {
        const str = data.toString();
        
        if (str.includes('error') || str.includes('Error') || str.includes('failed')) {
          console.error(`FFmpeg error for ${videoId}:`, str.trim());
        }

        const durMatch = str.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        if (durMatch && !totalDuration) {
          const h = parseInt(durMatch[1], 10);
          const m = parseInt(durMatch[2], 10);
          const s = parseFloat(durMatch[3]);
          totalDuration = h * 3600 + m * 60 + s;
          console.log(`📊 Duration for ${videoId}: ${totalDuration}s`);
        }

        const timeMatch = str.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch && totalDuration) {
          const h = parseInt(timeMatch[1], 10);
          const m = parseInt(timeMatch[2], 10);
          const s = parseFloat(timeMatch[3]);
          const currentProgress = h * 3600 + m * 60 + s;
          
          const percent = Math.min(99, Math.floor((currentProgress / totalDuration) * 100));
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;
          const speed = elapsed > 0 && currentProgress > 0 ? currentProgress / elapsed : 1;
          const remainingSeconds = speed > 0 ? (totalDuration - currentProgress) / speed : 0;
          
          const shouldUpdate = 
            percent !== lastPercent && (
              percent - lastPercent >= 1 || 
              now - lastUpdateTime >= 2000
            );
          
          if (shouldUpdate) {
            job.updateProgress({
              percent,
              eta: formatTime(remainingSeconds),
              etaSeconds: Math.round(remainingSeconds),
              currentTime: currentProgress,
              duration: totalDuration,
              speed: speed.toFixed(2),
              currentStep: `Transcoding ${percent}%`,
              processingTime: Math.round(elapsed),
            });
            
            lastUpdateTime = now;
            lastPercent = percent;
            
            if (percent % 10 === 0 && percent !== 0) {
              console.log(`🔄 ${videoId}: ${percent}% - ETA: ${formatTime(remainingSeconds)}`);
            }
          }
        }
        
        const speedMatch = str.match(/speed=\s*([\d.]+)x/);
        if (speedMatch) {
          const ffmpegSpeed = parseFloat(speedMatch[1]);
          job.updateProgress({ ffmpegSpeed: ffmpegSpeed.toFixed(2) });
        }
        
        if (str.includes('muxing overhead')) {
          job.updateProgress({ currentStep: 'Finalizing...' });
        }
      });

      ff.on('close', async (code, signal) => {
        const now = Date.now();
        const totalTime = (now - startTime) / 1000;
        
        console.log(`📦 FFmpeg exited for ${videoId}: code=${code}, time=${totalTime.toFixed(1)}s`);
        
        if (code === 0 || code === null) {
          try {
            if (inputPath && fs.existsSync(inputPath)) {
              await fs.promises.unlink(inputPath);
              console.log(`🗑️  Cleaned up: ${inputPath}`);
            }
          } catch (err) {
            console.error(`⚠️  Cleanup failed:`, err);
          }

          const masterPath = `${baseDir}/master.m3u8`;
          if (fs.existsSync(masterPath)) {
            console.log(`✅ Master playlist created for ${videoId}`);
          }

          console.log(`✅ ${videoId}: Completed in ${totalTime.toFixed(1)}s`);
          
          resolve({
            success: true,
            videoId,
            processingTime: totalTime,
            duration: totalDuration,
            resolutions: ['720p', '1080p'],
          });
        } else {
          const error = `FFmpeg exited with code ${code}${signal ? ` and signal ${signal}` : ''}`;
          console.error(`❌ ${videoId}: ${error}`);
          reject(new Error(error));
        }
      });

      ff.on('error', (err) => {
        console.error(`🔥 FFmpeg error for ${videoId}:`, err);
        reject(err);
      });
    });
  },
  {
    connection: redisConnection,
    concurrency: 1,
    limiter: {
      max: 1,
      duration: 1000,
    },
  }
);

videoWorker.on('completed', (job, result) => {
  console.log(`✅ Video job completed: ${job.id}`);
});

videoWorker.on('failed', (job, err) => {
  console.error(`❌ Video job failed: ${job?.id} - ${err.message}`);
});

videoWorker.on('error', (err) => {
  console.error('❌ Video worker error:', err);
});

console.log('🎬 Video worker started');