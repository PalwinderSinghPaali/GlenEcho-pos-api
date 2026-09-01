import { DataTypes, Model, Optional} from 'sequelize';
import sequelize from '@/database/connection';
import { Permission } from './permissions.model';

export interface RoleAttributes {
  id: number;
  role: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type RoleCreationAttributes = Optional<RoleAttributes, 'id'>;

export class Role extends Model<RoleAttributes, RoleCreationAttributes> implements RoleAttributes {
  public id!: number;
  public role!: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public readonly permissions?: Permission[];
}

Role.init(
  {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
  },
  {
    sequelize,
    tableName: 'roles',
    modelName: 'Role',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['role'],
      },
    ],
  }
);
