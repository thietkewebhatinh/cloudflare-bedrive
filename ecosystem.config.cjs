module.exports = {
  apps: [
    {
      name: 'bedrive',
      script: 'npx',
      args: 'wrangler pages dev dist --ip 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '',
        CDN_URL: process.env.CDN_URL || 'http://localhost:3000/r2',
        APP_URL: process.env.APP_URL || 'http://localhost:3000',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 5,
    }
  ]
}
