import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface ProductAttributes {
  id: number;
  lightspeed_item_id: string;
  product_matrix_id: number | null;
  brand_id: number | null;
  category_id: number | null;
  system_sku: string | null;
  custom_sku: string | null;
  upc: string | null;
  ean: string | null;
  manufacturer_sku: string | null;
  description: string | null;
  price: number;
  msrp: number;
  online_price: number;
  default_cost: number;
  avg_cost: number;
  qoh: number;
  discountable: boolean;
  taxable: boolean;
  item_type: string;
  publish_to_ecom: boolean;
  serialized: boolean;
  attribute_1_value: string | null;
  attribute_2_value: string | null;
  attribute_3_value: string | null;
  note: string | null;
  display_note: boolean;
  archived: boolean;
  tsv_search: string | null;
  tax_class_id: string | null;
  tax_class_name: string | null;
  lightspeed_create_time?: Date | null;
}

export type ProductCreationAttributes = Optional<
  ProductAttributes,
  | 'id'
  | 'product_matrix_id'
  | 'brand_id'
  | 'category_id'
  | 'system_sku'
  | 'custom_sku'
  | 'upc'
  | 'ean'
  | 'manufacturer_sku'
  | 'description'
  | 'price'
  | 'msrp'
  | 'online_price'
  | 'default_cost'
  | 'avg_cost'
  | 'qoh'
  | 'discountable'
  | 'taxable'
  | 'item_type'
  | 'publish_to_ecom'
  | 'serialized'
  | 'attribute_1_value'
  | 'attribute_2_value'
  | 'attribute_3_value'
  | 'note'
  | 'display_note'
  | 'archived'
  | 'tsv_search'
  | 'tax_class_id'
  | 'tax_class_name'
  | 'lightspeed_create_time'
>;

export class Product extends Model<ProductAttributes, ProductCreationAttributes> implements ProductAttributes {
  declare id: number;
  declare lightspeed_item_id: string;
  declare product_matrix_id: number | null;
  declare brand_id: number | null;
  declare category_id: number | null;
  declare system_sku: string | null;
  declare custom_sku: string | null;
  declare upc: string | null;
  declare ean: string | null;
  declare manufacturer_sku: string | null;
  declare description: string | null;
  declare price: number;
  declare msrp: number;
  declare online_price: number;
  declare default_cost: number;
  declare avg_cost: number;
  declare qoh: number;
  declare discountable: boolean;
  declare taxable: boolean;
  declare item_type: string;
  declare publish_to_ecom: boolean;
  declare serialized: boolean;
  declare attribute_1_value: string | null;
  declare attribute_2_value: string | null;
  declare attribute_3_value: string | null;
  declare note: string | null;
  declare display_note: boolean;
  declare archived: boolean;
  declare tsv_search: string | null;
  declare tax_class_id: string | null;
  declare tax_class_name: string | null;
  declare lightspeed_create_time: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Product.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_item_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    product_matrix_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'product_matrices',
        key: 'id',
      },
    },
    brand_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'brands',
        key: 'id',
      },
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'categories',
        key: 'id',
      },
    },
    system_sku: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    custom_sku: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    upc: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ean: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    manufacturer_sku: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('price');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    msrp: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('msrp');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    online_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('online_price');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    default_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('default_cost');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    avg_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('avg_cost');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    qoh: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    discountable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    taxable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    item_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Item',
    },
    publish_to_ecom: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    serialized: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    attribute_1_value: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    attribute_2_value: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    attribute_3_value: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    display_note: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    tsv_search: {
      type: DataTypes.TSVECTOR,
      allowNull: true,
    },
    tax_class_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tax_class_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lightspeed_create_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'products',
    modelName: 'Product',
    timestamps: true,
  }
);

export default Product;
