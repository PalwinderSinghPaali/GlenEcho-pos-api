import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface ProductSalesStatsAttributes {
  id: number;
  product_id: number;
  units_sold_7d: number;
  units_sold_prior_7d: number;
  units_sold_30d: number;
  units_sold_all_time: number;
  revenue_30d: number;
  last_computed_at: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProductSalesStatsCreationAttributes = Optional<
  ProductSalesStatsAttributes,
  | 'id'
  | 'units_sold_7d'
  | 'units_sold_prior_7d'
  | 'units_sold_30d'
  | 'units_sold_all_time'
  | 'revenue_30d'
  | 'last_computed_at'
  | 'createdAt'
  | 'updatedAt'
>;

export class ProductSalesStats
  extends Model<ProductSalesStatsAttributes, ProductSalesStatsCreationAttributes>
  implements ProductSalesStatsAttributes
{
  declare id: number;
  declare product_id: number;
  declare units_sold_7d: number;
  declare units_sold_prior_7d: number;
  declare units_sold_30d: number;
  declare units_sold_all_time: number;
  declare revenue_30d: number;
  declare last_computed_at: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ProductSalesStats.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: 'products',
        key: 'id',
      },
    },
    units_sold_7d: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    units_sold_prior_7d: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    units_sold_30d: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    units_sold_all_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    revenue_30d: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const value = this.getDataValue('revenue_30d');
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    last_computed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'product_sales_stats',
    modelName: 'ProductSalesStats',
    timestamps: true,
  }
);

export default ProductSalesStats;
