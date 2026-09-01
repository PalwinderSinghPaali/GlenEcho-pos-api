import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface LightspeedSchedulerJobAttributes {
  id: number;
  name: string;
  cron: string;
  job_type: string;
  enabled: boolean;
  last_run_at: Date | null;
}

export type LightspeedSchedulerJobCreationAttributes = Optional<
  LightspeedSchedulerJobAttributes,
  'id' | 'enabled' | 'last_run_at'
>;

export class LightspeedSchedulerJob extends Model<
  LightspeedSchedulerJobAttributes,
  LightspeedSchedulerJobCreationAttributes
> implements LightspeedSchedulerJobAttributes {
  declare id: number;
  declare name: string;
  declare cron: string;
  declare job_type: string;
  declare enabled: boolean;
  declare last_run_at: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

LightspeedSchedulerJob.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    cron: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    job_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    last_run_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'sync_scheduler_jobs',
    modelName: 'LightspeedSchedulerJob',
    timestamps: true,
  }
);

export default LightspeedSchedulerJob;
