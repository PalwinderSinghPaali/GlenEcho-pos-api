import { DataTypes, Model } from 'sequelize';
import sequelize from '@/database/connection';

export interface LightspeedConfigAttributes {
  id: number;
  access_token: string | null;
  access_token_expires_at: Date | null;
  last_sync_time: Date | null;
  account_id: string | null;
  refresh_token: string | null;
  /**
   * When true, all outbound PUSH/write jobs to Lightspeed are blocked.
   * Set to false only after the integration has been verified in read-only mode.
   */
  read_only_mode: boolean;
}

export class LightspeedConfig extends Model<LightspeedConfigAttributes> implements LightspeedConfigAttributes {
  declare id: number;
  declare access_token: string | null;
  declare access_token_expires_at: Date | null;
  declare last_sync_time: Date | null;
  declare account_id: string | null;
  declare refresh_token: string | null;
  declare read_only_mode: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

LightspeedConfig.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      defaultValue: 1,
    },
    access_token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    access_token_expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_sync_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    account_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    refresh_token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    read_only_mode: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true, // Safe default: always read-only until explicitly enabled
    },
  },
  {
    sequelize,
    tableName: 'lightspeed_configs',
    modelName: 'LightspeedConfig',
    timestamps: true,
    paranoid: false,
  }
);

export default LightspeedConfig;
