import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface CreditAccountAttributes {
  id: number;
  lightspeed_credit_account_id: string;
  name: string;
  code: string | null;
  description: string | null;
  gift_card: boolean;
  balance: number;
}

export type CreditAccountCreationAttributes = Optional<CreditAccountAttributes, 'id' | 'code' | 'description' | 'gift_card' | 'balance'>;

export class CreditAccount extends Model<CreditAccountAttributes, CreditAccountCreationAttributes> implements CreditAccountAttributes {
  declare id: number;
  declare lightspeed_credit_account_id: string;
  declare name: string;
  declare code: string | null;
  declare description: string | null;
  declare gift_card: boolean;
  declare balance: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

CreditAccount.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_credit_account_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    gift_card: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    balance: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      get() {
        const value = this.getDataValue('balance');
        return value ? parseFloat(value.toString()) : 0;
      }
    },
  },
  {
    sequelize,
    tableName: 'credit_accounts',
    modelName: 'CreditAccount',
    timestamps: true,
  }
);

export default CreditAccount;
