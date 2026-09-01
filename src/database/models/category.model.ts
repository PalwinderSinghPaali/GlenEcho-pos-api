import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface CategoryAttributes {
  id: number;
  lightspeed_category_id: string;
  parent_id: number | null;
  name: string;
  full_path_name: string | null;
  node_depth: number;
}

export type CategoryCreationAttributes = Optional<
  CategoryAttributes,
  'id' | 'parent_id' | 'full_path_name' | 'node_depth'
>;

export class Category extends Model<CategoryAttributes, CategoryCreationAttributes> implements CategoryAttributes {
  declare id: number;
  declare lightspeed_category_id: string;
  declare parent_id: number | null;
  declare name: string;
  declare full_path_name: string | null;
  declare node_depth: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Category.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_category_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    parent_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'categories',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    full_path_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    node_depth: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'categories',
    modelName: 'Category',
    timestamps: true,
  }
);

export default Category;
