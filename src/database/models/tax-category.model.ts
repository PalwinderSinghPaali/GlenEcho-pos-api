import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface TaxCategoryAttributes {
  id: number;
  lightspeed_tax_category_id: string;
  is_tax_inclusive: boolean;
  tax_1_name: string | null;
  tax_2_name: string | null;
  tax_1_rate: number;
  tax_2_rate: number;
}

export type TaxCategoryCreationAttributes = Optional<
  TaxCategoryAttributes,
  'id' | 'is_tax_inclusive' | 'tax_1_name' | 'tax_2_name' | 'tax_1_rate' | 'tax_2_rate'
>;

export class TaxCategory extends Model<TaxCategoryAttributes, TaxCategoryCreationAttributes> implements TaxCategoryAttributes {
  declare id: number;
  declare lightspeed_tax_category_id: string;
  declare is_tax_inclusive: boolean;
  declare tax_1_name: string | null;
  declare tax_2_name: string | null;
  declare tax_1_rate: number;
  declare tax_2_rate: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

TaxCategory.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_tax_category_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    is_tax_inclusive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    tax_1_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tax_2_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tax_1_rate: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0.0000,
      get() {
        const value = this.getDataValue('tax_1_rate');
        return value ? parseFloat(value.toString()) : 0;
      }
    },
    tax_2_rate: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0.0000,
      get() {
        const value = this.getDataValue('tax_2_rate');
        return value ? parseFloat(value.toString()) : 0;
      }
    },
  },
  {
    sequelize,
    tableName: 'tax_categories',
    modelName: 'TaxCategory',
    timestamps: true,
  }
);

export default TaxCategory;
