import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface PermissionAttributes {
  id: number;
  role_id: number;
  menu: string;
  create: boolean;
  edit: boolean;
  view: boolean;
  delete: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PermissionCreationAttributes = Optional<PermissionAttributes, 'id'>;

export class Permission extends Model<PermissionAttributes, PermissionCreationAttributes> implements PermissionAttributes {
  public id!: number;
  public role_id!: number;
  public menu!: string;
  public create!: boolean;
  public edit!: boolean;
  public view!: boolean;
  public delete!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Permission.init(
  {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'roles', key: 'id' },
      onDelete: 'CASCADE',
    },
    menu: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    create: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    edit: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    view: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    delete: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
  },
  {
    sequelize,
    tableName: 'permissions',
    modelName: 'Permission',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['role_id', 'menu'],
      },
    ],
  }
);

