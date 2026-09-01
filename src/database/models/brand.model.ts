import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface BrandAttributes {
  id: number;
  lightspeed_brand_id: string;
  name: string;
}

export type BrandCreationAttributes = Optional<BrandAttributes, 'id'>;

export class Brand extends Model<BrandAttributes, BrandCreationAttributes> implements BrandAttributes {
  declare id: number;
  declare lightspeed_brand_id: string;
  declare name: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Brand.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_brand_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'brands',
    modelName: 'Brand',
    timestamps: true,
  }
);

export default Brand;
