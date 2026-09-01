import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface ItemAttributeSetAttributes {
  id: number;
  lightspeed_attribute_set_id: string;
  name: string;
  attribute_name_1: string | null;
  attribute_name_2: string | null;
  attribute_name_3: string | null;
  system: boolean;
  archived: boolean;
}

export type ItemAttributeSetCreationAttributes = Optional<
  ItemAttributeSetAttributes,
  'id' | 'attribute_name_1' | 'attribute_name_2' | 'attribute_name_3' | 'system' | 'archived'
>;

export class ItemAttributeSet extends Model<ItemAttributeSetAttributes, ItemAttributeSetCreationAttributes>
  implements ItemAttributeSetAttributes {
  declare id: number;
  declare lightspeed_attribute_set_id: string;
  declare name: string;
  declare attribute_name_1: string | null;
  declare attribute_name_2: string | null;
  declare attribute_name_3: string | null;
  declare system: boolean;
  declare archived: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ItemAttributeSet.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_attribute_set_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    attribute_name_1: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    attribute_name_2: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    attribute_name_3: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    system: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'item_attribute_sets',
    modelName: 'ItemAttributeSet',
    timestamps: true,
  }
);

export default ItemAttributeSet;
