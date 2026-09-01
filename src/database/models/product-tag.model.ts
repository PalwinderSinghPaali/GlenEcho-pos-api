import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface ProductTagAttributes {
  id: number;
  product_id: number;
  tag_id: number;
}

export type ProductTagCreationAttributes = Optional<ProductTagAttributes, 'id'>;

export class ProductTag extends Model<ProductTagAttributes, ProductTagCreationAttributes>
  implements ProductTagAttributes {
  declare id: number;
  declare product_id: number;
  declare tag_id: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ProductTag.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id',
      },
    },
    tag_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'tags',
        key: 'id',
      },
    },
  },
  {
    sequelize,
    tableName: 'product_tags',
    modelName: 'ProductTag',
    timestamps: true,
    paranoid: false,
    indexes: [
      {
        unique: true,
        fields: ['product_id', 'tag_id'],
        name: 'unique_product_tag_idx',
      },
    ],
  }
);

export default ProductTag;
