import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface ProductInventoryAttributes {
  id: number;
  product_id: number;
  shop_id: number;
  qoh: number;
  unit_cost: number;
  reorder_point: number;
  reorder_level: number;
  lightspeed_item_shop_id: string | null;
  total_value: number;
  reserved: number;
  layaway: number;
  special_order: number;
  workorder: number;
  total_sale_value: number;
  sellable: number;
}

export type ProductInventoryCreationAttributes = Optional<
  ProductInventoryAttributes,
  | 'id'
  | 'qoh'
  | 'unit_cost'
  | 'reorder_point'
  | 'reorder_level'
  | 'lightspeed_item_shop_id'
  | 'total_value'
  | 'reserved'
  | 'layaway'
  | 'special_order'
  | 'workorder'
  | 'total_sale_value'
  | 'sellable'
>;

export class ProductInventory
  extends Model<ProductInventoryAttributes, ProductInventoryCreationAttributes>
  implements ProductInventoryAttributes
{
  declare id: number;
  declare product_id: number;
  declare shop_id: number;
  declare qoh: number;
  declare unit_cost: number;
  declare reorder_point: number;
  declare reorder_level: number;
  declare lightspeed_item_shop_id: string | null;
  declare total_value: number;
  declare reserved: number;
  declare layaway: number;
  declare special_order: number;
  declare workorder: number;
  declare total_sale_value: number;
  declare sellable: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ProductInventory.init(
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
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'shops',
        key: 'id',
      },
    },
    qoh: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    unit_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('unit_cost');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    reorder_point: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    reorder_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lightspeed_item_shop_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    total_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('total_value');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    reserved: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    layaway: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    special_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    workorder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_sale_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('total_sale_value');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    sellable: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'product_inventories',
    modelName: 'ProductInventory',
    timestamps: true,
    paranoid: false,
    indexes: [
      {
        unique: true,
        fields: ['product_id', 'shop_id'],
        name: 'unique_product_shop_idx',
      },
    ],
  }
);

export default ProductInventory;
