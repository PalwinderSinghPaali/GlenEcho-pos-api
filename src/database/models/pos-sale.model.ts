import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface POSSaleAttributes {
  id: number;
  lightspeed_sale_id: string;
  shop_id: number | null;
  register_id: number | null;
  employee_id: number | null;
  customer_id: number | null;
  completed: boolean;
  voided: boolean;
  total: number;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  sale_time: Date;
  lightspeed_updated_at: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type POSSaleCreationAttributes = Optional<
  POSSaleAttributes,
  | 'id'
  | 'shop_id'
  | 'register_id'
  | 'employee_id'
  | 'customer_id'
  | 'completed'
  | 'voided'
  | 'total'
  | 'subtotal'
  | 'tax_total'
  | 'discount_total'
  | 'lightspeed_updated_at'
  | 'createdAt'
  | 'updatedAt'
>;

export class POSSale extends Model<POSSaleAttributes, POSSaleCreationAttributes> implements POSSaleAttributes {
  declare id: number;
  declare lightspeed_sale_id: string;
  declare shop_id: number | null;
  declare register_id: number | null;
  declare employee_id: number | null;
  declare customer_id: number | null;
  declare completed: boolean;
  declare voided: boolean;
  declare total: number;
  declare subtotal: number;
  declare tax_total: number;
  declare discount_total: number;
  declare sale_time: Date;
  declare lightspeed_updated_at: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

POSSale.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    lightspeed_sale_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'shops',
        key: 'id',
      },
    },
    register_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'registers',
        key: 'id',
      },
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'employees',
        key: 'id',
      },
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'customers',
        key: 'id',
      },
    },
    completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    voided: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('total');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    subtotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('subtotal');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    tax_total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('tax_total');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    discount_total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('discount_total');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    sale_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lightspeed_updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'pos_sales',
    modelName: 'POSSale',
    timestamps: true,
  }
);

export default POSSale;
