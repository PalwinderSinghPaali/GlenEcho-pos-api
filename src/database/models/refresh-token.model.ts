import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';
import { User } from '@/database/models/user.model';

export interface RefreshTokenAttributes {
  id: number;
  token: string;
  user_id: number;
  expires_at: Date;
  is_revoked: boolean;
  replaced_by_token?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type RefreshTokenCreationAttributes = Optional<RefreshTokenAttributes, 'id' | 'is_revoked'>;

export class RefreshToken extends Model<RefreshTokenAttributes, RefreshTokenCreationAttributes> implements RefreshTokenAttributes {
  public id!: number;
  public token!: string;
  public user_id!: number;
  public expires_at!: Date;
  public is_revoked!: boolean;
  public replaced_by_token?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Helper properties
  public get isExpired(): boolean {
    return new Date() >= this.expires_at;
  }

  public get isActive(): boolean {
    return !this.is_revoked && !this.isExpired;
  }
}

RefreshToken.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true,
    },
    token: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    is_revoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    replaced_by_token: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'refresh_tokens',
    modelName: 'RefreshToken',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['token'],
      },
      {
        fields: ['user_id'],
      },
    ],
  }
);

// Define associations
RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' });
