import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface EmployeeAttributes {
  id: number;
  lightspeed_employee_id: string;
  first_name: string;
  last_name: string | null;
  lock_out: boolean;
  archived: boolean;
  contact_id: string | null;
  clock_in_employee_hours_id: string | null;
  employee_role_id: string | null;
  employee_role_name: string | null;
  limit_to_shop_id: number | null;
  lightspeed_limit_to_shop_id: string | null;
  last_shop_id: number | null;
  lightspeed_last_shop_id: string | null;
  last_sale_id: string | null;
  last_register_id: string | null;
  email: string | null;
  phone: string | null;
  time_stamp: Date | null;
}

export type EmployeeCreationAttributes = Optional<
  EmployeeAttributes,
  | 'id'
  | 'last_name'
  | 'lock_out'
  | 'archived'
  | 'contact_id'
  | 'clock_in_employee_hours_id'
  | 'employee_role_id'
  | 'employee_role_name'
  | 'limit_to_shop_id'
  | 'lightspeed_limit_to_shop_id'
  | 'last_shop_id'
  | 'lightspeed_last_shop_id'
  | 'last_sale_id'
  | 'last_register_id'
  | 'email'
  | 'phone'
  | 'time_stamp'
>;

export class Employee
  extends Model<EmployeeAttributes, EmployeeCreationAttributes>
  implements EmployeeAttributes
{
  declare id: number;
  declare lightspeed_employee_id: string;
  declare first_name: string;
  declare last_name: string | null;
  declare lock_out: boolean;
  declare archived: boolean;
  declare contact_id: string | null;
  declare clock_in_employee_hours_id: string | null;
  declare employee_role_id: string | null;
  declare employee_role_name: string | null;
  declare limit_to_shop_id: number | null;
  declare lightspeed_limit_to_shop_id: string | null;
  declare last_shop_id: number | null;
  declare lightspeed_last_shop_id: string | null;
  declare last_sale_id: string | null;
  declare last_register_id: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare time_stamp: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Employee.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_employee_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lock_out: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    contact_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    clock_in_employee_hours_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    employee_role_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    employee_role_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    limit_to_shop_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'shops',
        key: 'id',
      },
    },
    lightspeed_limit_to_shop_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_shop_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'shops',
        key: 'id',
      },
    },
    lightspeed_last_shop_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_sale_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_register_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    time_stamp: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'employees',
    modelName: 'Employee',
    timestamps: true,
    paranoid: false,
  }
);

export default Employee;
