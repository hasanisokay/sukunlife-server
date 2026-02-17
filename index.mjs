import app from "./src/app.js";
import { closeConnection } from "./src/config/db.mjs";
import { shutdownWorkers } from "./src/workers/index.mjs";

const PORT = process.env.PORT || 5000;

// ============================================================================
// START SERVER
// ============================================================================
const server = app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✓ Sukunlife API Server Started`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ Port: ${PORT}`);
  console.log(`✓ Process ID: ${process.pid}`);
  console.log(`✓ Node Version: ${process.version}`);
  console.log(`✓ Started at: ${new Date().toLocaleString()}`);
  console.log('═══════════════════════════════════════════════════════');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} signal received: Starting graceful shutdown...`);
  
  server.close(async () => {
    console.log('✓ HTTP server closed (no new connections accepted)');
    
    try {
      // Close workers
      await shutdownWorkers();
      console.log('✓ Workers closed');
      
      // Close MongoDB connection
      await closeConnection();
      console.log('✓ MongoDB closed');
      
      console.log('✓ Graceful shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('✗ Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('✗ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// ============================================================================
// SIGNAL HANDLERS
// ============================================================================
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('═══════════════════════════════════════════════════════');
  console.error('✗ UNCAUGHT EXCEPTION - Application will shut down');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  console.error('═══════════════════════════════════════════════════════');
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('═══════════════════════════════════════════════════════');
  console.error('✗ UNHANDLED PROMISE REJECTION - Application will shut down');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('═══════════════════════════════════════════════════════');
  gracefulShutdown('UNHANDLED_REJECTION');
});

process.on('warning', (warning) => {
  console.warn('⚠ Warning:', warning.name);
  console.warn('Message:', warning.message);
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Stack:', warning.stack);
  }
});

export default server;