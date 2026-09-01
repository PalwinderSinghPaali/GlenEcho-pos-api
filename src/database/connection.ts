import { Sequelize, Options } from 'sequelize';
import config from '@/config';
import logger from '@/utils/logger';

// Build Replication config if read-replicas are enabled
const replicationConfig = config.db.readHosts && config.db.readHosts.length > 0
  ? {
      write: {
        host: config.db.writeHost,
        username: config.db.user,
        password: config.db.password,
        pool: {
          max: config.db.pool.max,
          min: config.db.pool.min,
          acquire: config.db.pool.acquire,
          idle: config.db.pool.idle,
        },
      },
      read: config.db.readHosts.map((host) => ({
        host,
        username: config.db.user,
        password: config.db.password,
        pool: {
          max: Math.ceil(config.db.pool.max / config.db.readHosts.length),
          min: Math.ceil(config.db.pool.min / config.db.readHosts.length),
          acquire: config.db.pool.acquire,
          idle: config.db.pool.idle,
        },
      })),
    }
  : undefined;

const sequelizeOptions: Options = {
  dialect: 'postgres',
  logging: config.db.logging ? (msg) => logger.debug(msg) : false,
  benchmark: config.db.logging,
  define: {
    timestamps: true,
    underscored: true,
    paranoid: true, // Enable soft deletes globally
  },
};

// Use replication if configured; otherwise use single connection options
if (replicationConfig) {
  sequelizeOptions.replication = replicationConfig;
} else {
  sequelizeOptions.host = config.db.host;
  sequelizeOptions.port = config.db.port;
  sequelizeOptions.username = config.db.user;
  sequelizeOptions.password = config.db.password;
  sequelizeOptions.database = config.db.name;
  sequelizeOptions.pool = {
    max: config.db.pool.max,
    min: config.db.pool.min,
    acquire: config.db.pool.acquire,
    idle: config.db.pool.idle,
  };
}

const sequelize = new Sequelize(
  replicationConfig ? config.db.name : '',
  replicationConfig ? '' : config.db.name,
  replicationConfig ? '' : config.db.user,
  sequelizeOptions
);

export default sequelize;