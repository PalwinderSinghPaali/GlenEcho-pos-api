import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface ProductVendorAttributes {
  id: number;
  product_id: number;
  vendor_id: number;
  lightspeed_item_vendor_num_id: string | null;
  vendor_sku: string | null;
  vendor_cost: number;
  is_primary: boolean;
  lead_time: number;
  minimum_order_qty: number;
}

export type ProductVendorCreationAttributes = Optional<
  ProductVendorAttributes,
  'id' | 'lightspeed_item_vendor_num_id' | 'vendor_sku' | 'vendor_cost' | 'is_primary' | 'lead_time' | 'minimum_order_qty'
>;

export class ProductVendor extends Model<ProductVendorAttributes, ProductVendorCreationAttributes>
  implements ProductVendorAttributes {
  declare id: number;
  declare product_id: number;
  declare vendor_id: number;
  declare lightspeed_item_vendor_num_id: string | null;
  declare vendor_sku: string | null;
  declare vendor_cost: number;
  declare is_primary: boolean;
  declare lead_time: number;
  declare minimum_order_qty: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ProductVendor.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id',
      },
    },
    vendor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'vendors',
        key: 'id',
      },
    },
    lightspeed_item_vendor_num_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    vendor_sku: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    vendor_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      get() {
        const value = this.getDataValue('vendor_cost');
        return value ? parseFloat(value.toString()) : 0;
      }
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    lead_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    minimum_order_qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'product_vendors',
    modelName: 'ProductVendor',
    timestamps: true,
    paranoid: false,
  }
);

export default ProductVendor;
