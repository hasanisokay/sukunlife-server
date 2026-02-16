module.exports = {
  apps: [{
    name: 'sukunlife-api',
    script: './index.mjs',
    instances: 2, // Use 2 CPU cores (adjust based on your server)
    exec_mode: 'cluster',
    
    // Environment variables
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Memory management
    max_memory_restart: '1G', // Restart if memory exceeds 1GB
    
    // Restart configuration
    watch: false, // Don't watch files in production
    ignore_watch: ['node_modules', 'logs', 'uploads', 'public'],
    restart_delay: 4000, // Wait 4s before restart
    max_restarts: 10, // Max 10 restarts within 1 minute
    min_uptime: '10s', // Consider app stable after 10s
    
    // Auto-restart on crashes
    autorestart: true,
    
    // Graceful shutdown
    kill_timeout: 5000, // 5 seconds to gracefully shutdown
    listen_timeout: 3000,
    
    // Instance settings
    instance_var: 'INSTANCE_ID',
    
    // Advanced settings
    node_args: '--max-old-space-size=2048', // 2GB heap for Node.js (adjust based on RAM)
    
    // Cron restart (optional - restart daily at 3 AM)
    cron_restart: '0 3 * * *',
    
    // Source map support (if you use TypeScript/transpilation)
    source_map_support: false,
    
    // Merge env from .env file
    env_file: '.env'
  }]
};