module.exports = {
  apps: [
    {
      name: "sabsewa-local-api",
      script: "./index.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "development",
        PORT: 5001,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 5001,
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
