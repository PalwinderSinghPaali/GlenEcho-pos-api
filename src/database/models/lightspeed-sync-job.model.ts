import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface LightspeedSyncJobAttributes {
  id: number;
  job_type: string;
  payload: any;
  status: 'pending' | 'processing' | 'done' | 'retry' | 'dead_letter';
  attempts: number;
  max_attempts: number;
  run_at: Date;
  locked_by: string | null;
  locked_at: Date | null;
  error_message: string | null;
}

export type LightspeedSyncJobCreationAttributes = Optional<
  LightspeedSyncJobAttributes,
  'id' | 'payload' | 'status' | 'attempts' | 'max_attempts' | 'locked_by' | 'locked_at' | 'error_message'
>;

export class LightspeedSyncJob extends Model<
  LightspeedSyncJobAttributes,
  LightspeedSyncJobCreationAttributes
> implements LightspeedSyncJobAttributes {
  declare id: number;
  declare job_type: string;
  declare payload: any;
  declare status: 'pending' | 'processing' | 'done' | 'retry' | 'dead_letter';
  declare attempts: number;
  declare max_attempts: number;
  declare run_at: Date;
  declare locked_by: string | null;
  declare locked_at: Date | null;
  declare error_message: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

LightspeedSyncJob.init(
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    job_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'done', 'retry', 'dead_letter'),
      allowNull: false,
      defaultValue: 'pending',
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    max_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    },
    run_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    locked_by: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    locked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'sync_jobs',
    modelName: 'LightspeedSyncJob',
    timestamps: true,
    indexes: [
      {
        fields: ['status', 'run_at'],
        name: 'sync_jobs_status_run_at_idx',
      },
    ],
  }
);

export default LightspeedSyncJob;
