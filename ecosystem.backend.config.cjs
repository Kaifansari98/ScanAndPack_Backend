module.exports = {
    apps: [
      {
        name: "furnix-backend-staging",
        script: "dist/src/server.js",
        cwd: "/var/www/furnixcrm/staging/backend-staging",
        instances: 1,
        exec_mode: "fork",
        env: {
          NODE_ENV: "staging",
          PORT: 7778,
          // If you prefer, read the rest from .env via dotenv in your code
        },
      },
    ],
  };