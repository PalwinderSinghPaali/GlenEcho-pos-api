import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface PriceLevelAttributes {
  id: number;
  lightspeed_price_level_id: string;
  name: string;
  archived: boolean;
  can_be_archived: boolean;
  type: string;
  calculation: any | null;
}

export type PriceLevelCreationAttributes = Optional<
  PriceLevelAttributes,
  'id' | 'archived' | 'can_be_archived' | 'calculation'
>;

export class PriceLevel extends Model<PriceLevelAttributes, PriceLevelCreationAttributes>
  implements PriceLevelAttributes {
  declare id: number;
  declare lightspeed_price_level_id: string;
  declare name: string;
  declare archived: boolean;
  declare can_be_archived: boolean;
  declare type: string;
  declare calculation: any | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

PriceLevel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_price_level_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    can_be_archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    calculation: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'price_levels',
    modelName: 'PriceLevel',
    timestamps: true,
  }
);

export default PriceLevel;
