import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface ShopAttributes {
  id: number;
  lightspeed_shop_id: string;
  name: string;
  archived: boolean;
}

export type ShopCreationAttributes = Optional<ShopAttributes, 'id'>;

export class Shop extends Model<ShopAttributes, ShopCreationAttributes> implements ShopAttributes {
  declare id: number;
  declare lightspeed_shop_id: string;
  declare name: string;
  declare archived: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Shop.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_shop_id: {
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
  },
  {
    sequelize,
    tableName: 'shops',
    modelName: 'Shop',
    timestamps: true,
  }
);

export default Shop;
