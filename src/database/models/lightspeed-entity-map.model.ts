import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface LightspeedEntityMapAttributes {
  id: number;
  entity_type: string;
  lightspeed_id: string;
  local_id: number;
  last_sync: Date | null;
  hash: string | null;
}

export type LightspeedEntityMapCreationAttributes = Optional<
  LightspeedEntityMapAttributes,
  'id' | 'last_sync' | 'hash'
>;

export class LightspeedEntityMap extends Model<
  LightspeedEntityMapAttributes,
  LightspeedEntityMapCreationAttributes
> implements LightspeedEntityMapAttributes {
  declare id: number;
  declare entity_type: string;
  declare lightspeed_id: string;
  declare local_id: number;
  declare last_sync: Date | null;
  declare hash: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

LightspeedEntityMap.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    entity_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lightspeed_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    local_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    last_sync: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    hash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'lightspeed_entity_maps',
    modelName: 'LightspeedEntityMap',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['entity_type', 'lightspeed_id'],
        name: 'unique_entity_type_lightspeed_id_idx',
      },
    ],
  }
);

export default LightspeedEntityMap;
