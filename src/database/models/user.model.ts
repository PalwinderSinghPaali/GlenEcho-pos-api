import { DataTypes, Model, Optional } from 'sequelize';
import bcrypt from 'bcrypt';
import sequelize from '@/database/connection';
import config from '@/config';
import { Role } from './roles.model';

export interface UserAttributes {
  id: number;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_email_verified: boolean;
  role: number;
  reset_password_token?: string | null;
  reset_password_expires?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserCreationAttributes = Optional<UserAttributes, 'id' | 'is_active' | 'is_email_verified' | 'reset_password_token' | 'reset_password_expires'>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: number;
  declare email: string;
  declare password: string;
  declare first_name: string;
  declare last_name: string;
  declare role: number;
  declare is_active: boolean;
  declare is_email_verified: boolean;
  declare reset_password_token: string | null;
  declare reset_password_expires: Date | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  declare roles?: Role;

  /**
   * Helper method to compare user password with hash
   */
  public async comparePassword(password: string): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(password, this.password);
  }
}

User.init(
  {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
        notEmpty: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false, // Allow null for social logins
    },
    first_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    last_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    is_email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    role: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reset_password_token: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reset_password_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'users',
    modelName: 'User',
    timestamps: true,
    paranoid: true, // Soft delete enabled
    hooks: {
      beforeCreate: async (user: User) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, config.jwt.saltRounds);
        }
      },
      beforeUpdate: async (user: User) => {
        if (user.changed('password') && user.password) {
          user.password = await bcrypt.hash(user.password, config.jwt.saltRounds);
        }
      },
    },
    indexes: [
      {
        unique: true,
        fields: ['email'],
      },
    ],
  }
);

export default User;