import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface PaymentTransactionAttributes {
  id: number;
  order_id: number;
  provider: string;
  transaction_id: string;
  amount: number;
  status: string;
  raw_response?: any | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PaymentTransactionCreationAttributes = Optional<PaymentTransactionAttributes, 'id' | 'provider' | 'raw_response'>;

export class PaymentTransaction extends Model<PaymentTransactionAttributes, PaymentTransactionCreationAttributes> implements PaymentTransactionAttributes {
  declare id: number;
  declare order_id: number;
  declare provider: string;
  declare transaction_id: string;
  declare amount: number;
  declare status: string;
  declare raw_response: any | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

PaymentTransaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'orders',
        key: 'id',
      },
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'stripe',
    },
    transaction_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    raw_response: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'payment_transactions',
    modelName: 'PaymentTransaction',
    timestamps: true,
  }
);

export default PaymentTransaction;
