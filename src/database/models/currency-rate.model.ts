import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface CurrencyRateAttributes {
  id: number;
  lightspeed_currency_rate_id: string;
  currency_code: string;
  rate: number;
}

export type CurrencyRateCreationAttributes = Optional<
  CurrencyRateAttributes,
  'id' | 'rate'
>;

export class CurrencyRate extends Model<CurrencyRateAttributes, CurrencyRateCreationAttributes>
  implements CurrencyRateAttributes {
  declare id: number;
  declare lightspeed_currency_rate_id: string;
  declare currency_code: string;
  declare rate: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

CurrencyRate.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_currency_rate_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    currency_code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rate: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 1.0000,
      get() {
        const val = this.getDataValue('rate');
        return val ? parseFloat(val.toString()) : 1.0000;
      },
    },
  },
  {
    sequelize,
    tableName: 'currency_rates',
    modelName: 'CurrencyRate',
    timestamps: true,
  }
);

export default CurrencyRate;
