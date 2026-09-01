import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface DiscountAttributes {
  id: number;
  lightspeed_discount_id: string;
  name: string;
  discount_amount: number;
  discount_percent: number;
  require_customer: boolean;
  archived: boolean;
}

export type DiscountCreationAttributes = Optional<
  DiscountAttributes,
  'id' | 'discount_amount' | 'discount_percent' | 'require_customer' | 'archived'
>;

export class Discount extends Model<DiscountAttributes, DiscountCreationAttributes> implements DiscountAttributes {
  declare id: number;
  declare lightspeed_discount_id: string;
  declare name: string;
  declare discount_amount: number;
  declare discount_percent: number;
  declare require_customer: boolean;
  declare archived: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Discount.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_discount_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      get() {
        const value = this.getDataValue('discount_amount');
        return value ? parseFloat(value.toString()) : 0;
      }
    },
    discount_percent: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0.0000,
      get() {
        const value = this.getDataValue('discount_percent');
        return value ? parseFloat(value.toString()) : 0;
      }
    },
    require_customer: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'discounts',
    modelName: 'Discount',
    timestamps: true,
  }
);

export default Discount;
