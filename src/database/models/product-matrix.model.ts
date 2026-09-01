import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface ProductMatrixAttributes {
  id: number;
  lightspeed_matrix_id: string;
  description: string;
  attribute_1_name: string | null;
  attribute_2_name: string | null;
  attribute_3_name: string | null;
  brand_id: number | null;
  category_id: number | null;
  vendor_id: number | null;
  tax: boolean;
  default_cost: number;
  item_type: string;
  serialized: boolean;
  model_year: number;
  archived: boolean;
  tax_class_id: string | null;
  tax_class_name: string | null;
  item_attribute_set_id: number | null;
  attribute_1_values: string[] | null;
  attribute_2_values: string[] | null;
  attribute_3_values: string[] | null;
  price: number;
  msrp: number;
  online_price: number;
}

export type ProductMatrixCreationAttributes = Optional<
  ProductMatrixAttributes,
  | 'id'
  | 'attribute_1_name'
  | 'attribute_2_name'
  | 'attribute_3_name'
  | 'brand_id'
  | 'category_id'
  | 'vendor_id'
  | 'tax'
  | 'default_cost'
  | 'item_type'
  | 'serialized'
  | 'model_year'
  | 'archived'
  | 'tax_class_id'
  | 'tax_class_name'
  | 'item_attribute_set_id'
  | 'attribute_1_values'
  | 'attribute_2_values'
  | 'attribute_3_values'
  | 'price'
  | 'msrp'
  | 'online_price'
>;

export class ProductMatrix extends Model<ProductMatrixAttributes, ProductMatrixCreationAttributes>
  implements ProductMatrixAttributes {
  declare id: number;
  declare lightspeed_matrix_id: string;
  declare description: string;
  declare attribute_1_name: string | null;
  declare attribute_2_name: string | null;
  declare attribute_3_name: string | null;
  declare brand_id: number | null;
  declare category_id: number | null;
  declare vendor_id: number | null;
  declare tax: boolean;
  declare default_cost: number;
  declare item_type: string;
  declare serialized: boolean;
  declare model_year: number;
  declare archived: boolean;
  declare tax_class_id: string | null;
  declare tax_class_name: string | null;
  declare item_attribute_set_id: number | null;
  declare attribute_1_values: string[] | null;
  declare attribute_2_values: string[] | null;
  declare attribute_3_values: string[] | null;
  declare price: number;
  declare msrp: number;
  declare online_price: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ProductMatrix.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_matrix_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    attribute_1_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    attribute_2_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    attribute_3_name: {
      type: DataTypes.STRING,
      allowNull: true,
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
    vendor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'vendors',
        key: 'id',
      },
    },
    tax: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
    item_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'default',
    },
    serialized: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    model_year: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    tax_class_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tax_class_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    item_attribute_set_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'item_attribute_sets',
        key: 'id',
      },
    },
    attribute_1_values: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    attribute_2_values: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    attribute_3_values: {
      type: DataTypes.ARRAY(DataTypes.STRING),
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
  },
  {
    sequelize,
    tableName: 'product_matrices',
    modelName: 'ProductMatrix',
    timestamps: true,
  }
);

export default ProductMatrix;
