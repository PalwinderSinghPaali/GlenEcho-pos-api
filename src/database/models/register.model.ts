import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface RegisterAttributes {
  id: number;
  lightspeed_register_id: string;
  name: string;
  open: boolean;
  open_time: Date | null;
  tip_enabled: boolean;
  shop_id: number | null;
  lightspeed_shop_id: string | null;
  open_employee_id: number | null;
  lightspeed_open_employee_id: string | null;
  cc_terminal_id: string | null;
  archived: boolean;
}

export type RegisterCreationAttributes = Optional<
  RegisterAttributes,
  | 'id'
  | 'open'
  | 'open_time'
  | 'tip_enabled'
  | 'shop_id'
  | 'lightspeed_shop_id'
  | 'open_employee_id'
  | 'lightspeed_open_employee_id'
  | 'cc_terminal_id'
  | 'archived'
>;

export class Register
  extends Model<RegisterAttributes, RegisterCreationAttributes>
  implements RegisterAttributes
{
  declare id: number;
  declare lightspeed_register_id: string;
  declare name: string;
  declare open: boolean;
  declare open_time: Date | null;
  declare tip_enabled: boolean;
  declare shop_id: number | null;
  declare lightspeed_shop_id: string | null;
  declare open_employee_id: number | null;
  declare lightspeed_open_employee_id: string | null;
  declare cc_terminal_id: string | null;
  declare archived: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Register.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_register_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    open: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    open_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    tip_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'shops',
        key: 'id',
      },
    },
    lightspeed_shop_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    open_employee_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'employees',
        key: 'id',
      },
    },
    lightspeed_open_employee_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cc_terminal_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'registers',
    modelName: 'Register',
    timestamps: true,
    paranoid: false,
  }
);

export default Register;
