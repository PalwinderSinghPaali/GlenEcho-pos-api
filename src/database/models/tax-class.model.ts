import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface TaxClassAttributes {
  id: number;
  lightspeed_tax_class_id: string;
  name: string;
}

export type TaxClassCreationAttributes = Optional<TaxClassAttributes, 'id'>;

export class TaxClass
  extends Model<TaxClassAttributes, TaxClassCreationAttributes>
  implements TaxClassAttributes
{
  declare id: number;
  declare lightspeed_tax_class_id: string;
  declare name: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

TaxClass.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_tax_class_id: {
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
    tableName: 'tax_classes',
    modelName: 'TaxClass',
    timestamps: true,
    underscored: true,
    paranoid: false,
  }
);

export default TaxClass;
