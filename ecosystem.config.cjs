// PM2 Ecosystem Config - OID4VCI Issuer
// Usage: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'issuer-backend',
      script: 'dist/server.js',
      cwd: '/root/backend',
      node_args: '--max-old-space-size=512',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Auto restart on crash
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
    },
    {
      name: 'issuer-frontend',
      // Standalone server.js yang dihasilkan oleh `next build` dengan output: 'standalone'
      script: '.next/standalone/server.js',
      cwd: '/root/frontend',
      node_args: '--max-old-space-size=512',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
      },
      // Auto restart on crash
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
    },
  ],
}
