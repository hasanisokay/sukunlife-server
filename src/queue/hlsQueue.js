import { exec } from "child_process";

const queue = [];
let running = false;

// { videoId: { status, percent, eta } }
export const videoJobs = {};

// helper to format seconds → "5m 20s"
function formatTime(sec) {
  if (!sec || sec < 0 || !isFinite(sec)) return "calculating...";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s}s`;
}

export function addJob(videoId, cmd, onFinish = () => {}) {
  // init job state
  videoJobs[videoId] = {
    status: "queued",
    percent: 0,
    eta: "waiting...",
  };

  queue.push({ videoId, cmd, onFinish });
  processQueue();
}

function processQueue() {
  if (running) return;
  const job = queue.shift();
  if (!job) return;

  running = true;

  let duration = 0;
  let startTime = Date.now();

  videoJobs[job.videoId] = {
    status: "processing",
    percent: 0,
    eta: "calculating...",
  };

  const ff = exec(job.cmd);

  ff.stderr.on("data", (data) => {
    const str = data.toString();

    // 📏 total duration
    const durMatch = str.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (durMatch && !duration) {
      const h = parseInt(durMatch[1], 10);
      const m = parseInt(durMatch[2], 10);
      const s = parseFloat(durMatch[3]);
      duration = h * 3600 + m * 60 + s;
    }

    // ⏱ current progress time
    const timeMatch = str.match(/time=(\d+):(\d+):(\d+\.\d+)/);
    if (timeMatch && duration) {
      const h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      const s = parseFloat(timeMatch[3]);
      const current = h * 3600 + m * 60 + s;

      const percent = Math.min(
        100,
        Math.floor((current / duration) * 100)
      );

      const elapsed = (Date.now() - startTime) / 1000;
      const speed = current / elapsed || 1;
      const remaining = (duration - current) / speed;

      videoJobs[job.videoId].percent = percent;
      videoJobs[job.videoId].eta = formatTime(remaining);
    }
  });

  ff.on("close", (code) => {
    if (code === 0) {
      videoJobs[job.videoId] = {
        status: "ready",
        percent: 100,
        eta: "0s",
      };
    } else {
      videoJobs[job.videoId] = {
        status: "failed",
        percent: videoJobs[job.videoId]?.percent || 0,
        eta: "error",
      };
    }

    try {
      job.onFinish();
    } catch (e) {
      console.error("onFinish error:", e);
    }

    running = false;
    processQueue();
  });

  ff.on("error", (err) => {
    console.error("FFmpeg spawn error:", err);

    videoJobs[job.videoId] = {
      status: "failed",
      percent: videoJobs[job.videoId]?.percent || 0,
      eta: "error",
    };

    running = false;
    processQueue();
  });
}
