import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface ContactSubmissionAttributes {
  id: number;
  first_name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  source?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ContactSubmissionCreationAttributes = Optional<ContactSubmissionAttributes, 'id' | 'phone' | 'source'>;

export class ContactSubmission extends Model<ContactSubmissionAttributes, ContactSubmissionCreationAttributes> implements ContactSubmissionAttributes {
  declare id: number;
  declare first_name: string;
  declare email: string;
  declare phone: string | null;
  declare subject: string;
  declare message: string;
  declare source: string;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ContactSubmission.init(
  {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER,
    },
    first_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true,
        notEmpty: true,
      },
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    source: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'contact_us',
      validate: {
        notEmpty: true,
      },
    },
  },
  {
    sequelize,
    tableName: 'contact_submissions',
    modelName: 'ContactSubmission',
    timestamps: true,
    paranoid: true, // Soft delete enabled
    indexes: [
      {
        fields: ['email'],
      },
      {
        fields: ['source'],
      },
      {
        fields: ['created_at'],
      },
    ],
  }
);

export default ContactSubmission;
