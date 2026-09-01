import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface InventoryReservationAttributes {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  status: 'active' | 'consumed' | 'released';
  expires_at: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type InventoryReservationCreationAttributes = Optional<InventoryReservationAttributes, 'id' | 'status'>;

export class InventoryReservation extends Model<InventoryReservationAttributes, InventoryReservationCreationAttributes> implements InventoryReservationAttributes {
  declare id: number;
  declare order_id: number;
  declare product_id: number;
  declare quantity: number;
  declare status: 'active' | 'consumed' | 'released';
  declare expires_at: Date;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

InventoryReservation.init(
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
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id',
      },
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('active', 'consumed', 'released'),
      allowNull: false,
      defaultValue: 'active',
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'inventory_reservations',
    modelName: 'InventoryReservation',
    timestamps: true,
  }
);

export default InventoryReservation;
