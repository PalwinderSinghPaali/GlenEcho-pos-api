module.exports = {
  apps: [
    {
      name: 'pos-api-server',
      script: './dist/server.js',
      instances: 'max', // Spawns as many instances as available CPU cores
      exec_mode: 'cluster', // Enables clustering
      watch: false,
      max_memory_restart: '1G', // Restarts if memory usage exceeds 1GB (prevents memory leaks)
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-err.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
      listen_timeout: 8000,
      kill_timeout: 5000, // Wait 5s for graceful cleanup before killing process
    },
    {
      name: 'pos-queue-worker',
      script: './dist/server.js', // runs workers from the same bundle
      instances: 1, // Workers should usually run as singleton per node to avoid concurrent locks
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/pm2-worker-err.log',
      out_file: './logs/pm2-worker-out.log',
      merge_logs: true,
      time: true,
    }
  ],
};
