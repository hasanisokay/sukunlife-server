import { exec } from "child_process";

const queue = [];
let running = false;

// { videoId: { status, percent, eta, startTime, duration, currentTime, speed } }
export const videoJobs = {};

// helper to format seconds → "5m 20s" or "1h 5m"
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
    const s = Math.floor(sec % 60);
    if (m > 0 && s > 0) {
      return `${h}h ${m}m ${s}s`;
    } else if (m > 0) {
      return `${h}h ${m}m`;
    } else {
      return `${h}h`;
    }
  }
}

export function addJob(videoId, cmd, onFinish = () => {}) {
  // init job state
  videoJobs[videoId] = {
    status: "queued",
    percent: 0,
    eta: "waiting...",
    queueTime: Date.now(),
    startTime: null,
    duration: 0,
    currentTime: 0,
    speed: 1,
    fileSize: 0,
    processedBytes: 0
  };

  queue.push({ videoId, cmd, onFinish });
  processQueue();
}

function processQueue() {
  if (running) return;
  const job = queue.shift();
  if (!job) return;

  running = true;

  let totalDuration = 0;
  let currentProgress = 0;
  let startTime = Date.now();
  let lastUpdateTime = startTime;
  let lastProgress = 0;
  let processedBytes = 0;
  let totalBytes = 0;

  videoJobs[job.videoId] = {
    ...videoJobs[job.videoId],
    status: "processing",
    percent: 0,
    eta: "calculating...",
    startTime: startTime,
    currentStep: "Starting FFmpeg...",
  };

  console.log(`🎬 Starting FFmpeg for ${job.videoId}`);
  
  const ff = exec(job.cmd);

  ff.stderr.on("data", (data) => {
    const str = data.toString();
    
    // Log FFmpeg output for debugging
    if (str.includes("error") || str.includes("Error") || str.includes("failed")) {
      console.error(`FFmpeg error for ${job.videoId}:`, str.trim());
    }

    // 📏 Extract total duration
    const durMatch = str.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (durMatch && !totalDuration) {
      const h = parseInt(durMatch[1], 10);
      const m = parseInt(durMatch[2], 10);
      const s = parseFloat(durMatch[3]);
      totalDuration = h * 3600 + m * 60 + s;
      videoJobs[job.videoId].duration = totalDuration;
      console.log(`📊 Total duration for ${job.videoId}: ${totalDuration}s`);
    }

    // ⏱ Extract current progress time
    const timeMatch = str.match(/time=(\d+):(\d+):(\d+\.\d+)/);
    if (timeMatch && totalDuration) {
      const h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      const s = parseFloat(timeMatch[3]);
      currentProgress = h * 3600 + m * 60 + s;
      
      // Calculate percentage
      const percent = Math.min(99, Math.floor((currentProgress / totalDuration) * 100));
      
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      
      // Calculate speed (seconds processed per real second)
      let speed = 1;
      if (elapsed > 0 && currentProgress > 0) {
        speed = currentProgress / elapsed;
      }
      
      // Calculate ETA
      let remainingSeconds = 0;
      if (percent > 0 && speed > 0) {
        remainingSeconds = (totalDuration - currentProgress) / speed;
      }
      
      // Update job status every 1% change or 2 seconds, whichever comes first
      const shouldUpdate = 
        percent - videoJobs[job.videoId].percent >= 1 || 
        now - lastUpdateTime >= 2000;
      
      if (shouldUpdate) {
        videoJobs[job.videoId] = {
          ...videoJobs[job.videoId],
          percent: percent,
          eta: formatTime(remainingSeconds),
          currentTime: currentProgress,
          speed: speed,
          currentStep: `Transcoding ${percent}%`
        };
        
        lastUpdateTime = now;
        lastProgress = percent;
        
        // Log progress every 10%
        if (percent % 10 === 0) {
          console.log(`🔄 ${job.videoId}: ${percent}% - ETA: ${formatTime(remainingSeconds)}`);
        }
      }
    }
    
    // Extract bitrate/size info for better ETA estimation
    const sizeMatch = str.match(/size=\s*(\d+)kB/);
    if (sizeMatch) {
      const sizeKB = parseInt(sizeMatch[1], 10);
      processedBytes = sizeKB * 1024;
      videoJobs[job.videoId].processedBytes = processedBytes;
    }
    
    // Extract speed info from FFmpeg output
    const speedMatch = str.match(/speed=\s*([\d.]+)x/);
    if (speedMatch) {
      const speedX = parseFloat(speedMatch[1]);
      videoJobs[job.videoId].ffmpegSpeed = speedX;
    }
    
    // Check for specific processing steps
    if (str.includes("muxing overhead")) {
      videoJobs[job.videoId].currentStep = "Finalizing...";
    }
  });

  ff.stdout?.on("data", (data) => {
    // Sometimes FFmpeg outputs to stdout
    const str = data.toString();
    if (str.includes("progress") || str.includes("time=")) {
      // Forward to stderr handler
      ff.stderr.emit('data', data);
    }
  });

  ff.on("close", (code, signal) => {
    const now = Date.now();
    const totalTime = (now - startTime) / 1000;
    
    console.log(`📦 FFmpeg exited for ${job.videoId}: code=${code}, signal=${signal}, time=${totalTime.toFixed(1)}s`);
    
    if (code === 0 || code === null) {
      videoJobs[job.videoId] = {
        ...videoJobs[job.videoId],
        status: "completed",
        percent: 100,
        eta: "0s",
        currentStep: "Completed",
        completedAt: now,
        totalProcessingTime: totalTime
      };
      console.log(`✅ ${job.videoId}: Processing completed successfully in ${totalTime.toFixed(1)}s`);
    } else {
      videoJobs[job.videoId] = {
        ...videoJobs[job.videoId],
        status: "failed",
        percent: videoJobs[job.videoId]?.percent || 0,
        eta: "error",
        currentStep: `Failed with code ${code}`,
        error: `FFmpeg exited with code ${code}${signal ? ` and signal ${signal}` : ''}`,
        failedAt: now
      };
      console.error(`❌ ${job.videoId}: Processing failed with code ${code}`);
    }

    try {
      job.onFinish();
    } catch (e) {
      console.error(`⚠️ onFinish error for ${job.videoId}:`, e);
    }

    running = false;
    // Process next job in queue
    setTimeout(() => processQueue(), 100);
  });

  ff.on("error", (err) => {
    console.error(`🔥 FFmpeg spawn error for ${job.videoId}:`, err);

    videoJobs[job.videoId] = {
      ...videoJobs[job.videoId],
      status: "failed",
      percent: videoJobs[job.videoId]?.percent || 0,
      eta: "error",
      currentStep: "FFmpeg error",
      error: err.message,
      failedAt: Date.now()
    };

    running = false;
    setTimeout(() => processQueue(), 100);
  });
}

// Helper function to get all jobs
export function getAllJobs() {
  return videoJobs;
}

// Helper function to get specific job
export function getJob(videoId) {
  return videoJobs[videoId];
}

// Helper function to cancel a job
export function cancelJob(videoId) {
  if (videoJobs[videoId]) {
    videoJobs[videoId].status = "cancelled";
    videoJobs[videoId].cancelledAt = Date.now();
    return true;
  }
  return false;
}

// Clean up old completed jobs (optional)
export function cleanupOldJobs(maxAgeHours = 24) {
  const now = Date.now();
  const maxAge = maxAgeHours * 60 * 60 * 1000;
  
  Object.keys(videoJobs).forEach(videoId => {
    const job = videoJobs[videoId];
    const jobTime = job.completedAt || job.failedAt || job.cancelledAt || job.startTime;
    
    if (jobTime && (now - jobTime) > maxAge) {
      delete videoJobs[videoId];
    }
  });
}

// Auto cleanup every hour
setInterval(() => cleanupOldJobs(), 60 * 60 * 1000);