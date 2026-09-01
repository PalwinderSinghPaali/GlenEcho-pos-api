import { DataTypes, Model } from 'sequelize';
import sequelize from '@/database/connection';

export interface LightspeedSyncStateAttributes {
  entity_type: string;
  last_synced_at: Date | null;
  last_cursor_ts: string | null;
  status: 'idle' | 'running' | 'error';
  last_error: string | null;
  records_processed: number;
}

export class LightspeedSyncState extends Model<LightspeedSyncStateAttributes> implements LightspeedSyncStateAttributes {
  declare entity_type: string;
  declare last_synced_at: Date | null;
  declare last_cursor_ts: string | null;
  declare status: 'idle' | 'running' | 'error';
  declare last_error: string | null;
  declare records_processed: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

LightspeedSyncState.init(
  {
    entity_type: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    last_synced_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_cursor_ts: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('idle', 'running', 'error'),
      allowNull: false,
      defaultValue: 'idle',
    },
    last_error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    records_processed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'lightspeed_sync_states',
    modelName: 'LightspeedSyncState',
    timestamps: true,
  }
);

export default LightspeedSyncState;
