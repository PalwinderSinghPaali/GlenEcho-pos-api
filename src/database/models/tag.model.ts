import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface TagAttributes {
  id: number;
  lightspeed_tag_id: string;
  name: string;
  archived: boolean;
}

export type TagCreationAttributes = Optional<TagAttributes, 'id' | 'archived'>;

export class Tag extends Model<TagAttributes, TagCreationAttributes> implements TagAttributes {
  declare id: number;
  declare lightspeed_tag_id: string;
  declare name: string;
  declare archived: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Tag.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_tag_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'tags',
    modelName: 'Tag',
    timestamps: true,
  }
);

export default Tag;
