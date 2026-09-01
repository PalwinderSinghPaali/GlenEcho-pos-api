import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface OrderAttributes {
  id: number;
  order_uuid: string;
  user_id?: number | null;
  status: 'pending_payment' | 'authorized' | 'paid' | 'sync_failed' | 'synced' | 'manual_fulfillment_alert' | 'cancelled' | 'completed' | 'shipped';
  total_amount: number;
  subtotal_amount: number;
  tax_amount: number;
  shipping_amount: number;
  stripe_payment_intent?: string | null;
  lightspeed_sale_id?: string | null;
  lightspeed_ship_to_id?: string | null;
  shipped_locally: boolean;
  shipped_at?: Date | null;
  carrier?: string | null;
  tracking_number?: string | null;
  estimated_delivery?: Date | null;
  shipping_address?: any | null;
  billing_address?: any | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export type OrderCreationAttributes = Optional<
  OrderAttributes,
  | 'id'
  | 'order_uuid'
  | 'user_id'
  | 'status'
  | 'shipping_amount'
  | 'stripe_payment_intent'
  | 'lightspeed_sale_id'
  | 'lightspeed_ship_to_id'
  | 'shipped_locally'
  | 'shipped_at'
  | 'carrier'
  | 'tracking_number'
  | 'estimated_delivery'
  | 'shipping_address'
  | 'billing_address'
>;

export class Order extends Model<OrderAttributes, OrderCreationAttributes> implements OrderAttributes {
  declare id: number;
  declare order_uuid: string;
  declare user_id: number | null;
  declare status: 'pending_payment' | 'authorized' | 'paid' | 'sync_failed' | 'synced' | 'manual_fulfillment_alert' | 'cancelled' | 'completed' | 'shipped';
  declare total_amount: number;
  declare subtotal_amount: number;
  declare tax_amount: number;
  declare shipping_amount: number;
  declare stripe_payment_intent: string | null;
  declare lightspeed_sale_id: string | null;
  declare lightspeed_ship_to_id: string | null;
  declare shipped_locally: boolean;
  declare shipped_at: Date | null;
  declare carrier: string | null;
  declare tracking_number: string | null;
  declare estimated_delivery: Date | null;
  declare shipping_address: any | null;
  declare billing_address: any | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  declare readonly deletedAt: Date | null;
}

Order.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    order_uuid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      unique: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    status: {
      type: DataTypes.ENUM('pending_payment', 'authorized', 'paid', 'sync_failed', 'synced', 'manual_fulfillment_alert', 'cancelled', 'completed', 'shipped'),
      allowNull: false,
      defaultValue: 'pending_payment',
    },
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    subtotal_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    tax_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    shipping_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    stripe_payment_intent: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    lightspeed_sale_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lightspeed_ship_to_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    shipped_locally: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    shipped_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    carrier: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tracking_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    estimated_delivery: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    shipping_address: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    billing_address: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'orders',
    modelName: 'Order',
    timestamps: true,
    paranoid: true,
  }
);

export default Order;
