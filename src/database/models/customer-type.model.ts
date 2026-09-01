import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface CustomerTypeAttributes {
  id: number;
  lightspeed_customer_type_id: string;
  name: string;
  tax_category_id: number | null;
  discount_id: number | null;
}

export type CustomerTypeCreationAttributes = Optional<CustomerTypeAttributes, 'id' | 'tax_category_id' | 'discount_id'>;

export class CustomerType extends Model<CustomerTypeAttributes, CustomerTypeCreationAttributes> implements CustomerTypeAttributes {
  declare id: number;
  declare lightspeed_customer_type_id: string;
  declare name: string;
  declare tax_category_id: number | null;
  declare discount_id: number | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

CustomerType.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_customer_type_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tax_category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    discount_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'customer_types',
    modelName: 'CustomerType',
    timestamps: true,
  }
);

export default CustomerType;
