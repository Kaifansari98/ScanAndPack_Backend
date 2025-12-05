// Prisma 7 configuration file
// Connection URL is read from DATABASE_URL environment variable
export default {
  datasource: {
    url: process.env.DATABASE_URL,
  },
};