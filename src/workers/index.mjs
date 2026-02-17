import './videoWorker.mjs';
import './emailWorker.mjs';

console.log('🚀 All workers initialized');

// Graceful shutdown for workers
const shutdownWorkers = async () => {
  console.log('📴 Shutting down workers...');
  
  const { videoWorker } = await import('./videoWorker.mjs');
  const { emailWorker } = await import('./emailWorker.mjs');
  
  await Promise.all([
    videoWorker.close(),
    emailWorker.close(),
  ]);
  
  console.log('✓ All workers closed');
};

process.on('SIGTERM', shutdownWorkers);
process.on('SIGINT', shutdownWorkers);

export { shutdownWorkers };