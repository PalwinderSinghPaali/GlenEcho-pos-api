import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface POSSaleLineAttributes {
  id: number;
  sale_id: number;
  lightspeed_sale_line_id: string;
  product_id: number | null;
  lightspeed_item_id: string | null;
  unit_quantity: number;
  unit_price: number;
  calc_subtotal: number;
  calc_total: number;
  tax: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type POSSaleLineCreationAttributes = Optional<
  POSSaleLineAttributes,
  | 'id'
  | 'product_id'
  | 'lightspeed_item_id'
  | 'unit_quantity'
  | 'unit_price'
  | 'calc_subtotal'
  | 'calc_total'
  | 'tax'
  | 'createdAt'
  | 'updatedAt'
>;

export class POSSaleLine
  extends Model<POSSaleLineAttributes, POSSaleLineCreationAttributes>
  implements POSSaleLineAttributes
{
  declare id: number;
  declare sale_id: number;
  declare lightspeed_sale_line_id: string;
  declare product_id: number | null;
  declare lightspeed_item_id: string | null;
  declare unit_quantity: number;
  declare unit_price: number;
  declare calc_subtotal: number;
  declare calc_total: number;
  declare tax: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

POSSaleLine.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    sale_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'pos_sales',
        key: 'id',
      },
    },
    lightspeed_sale_line_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'products',
        key: 'id',
      },
    },
    lightspeed_item_id: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    unit_quantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 1.0,
      get() {
        const value = this.getDataValue('unit_quantity');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    unit_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('unit_price');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    calc_subtotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('calc_subtotal');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    calc_total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('calc_total');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    tax: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'pos_sale_lines',
    modelName: 'POSSaleLine',
    timestamps: true,
  }
);

export default POSSaleLine;
