import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';
import config from '@/config';

function getBaseUrl(): string {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/$/, '');
  }
  const host = process.env.APP_HOST || config.app.host || 'localhost';
  const port = process.env.PORT || config.app.port || 5000;
  
  if (host.startsWith('http://') || host.startsWith('https://')) {
    return host.replace(/\/$/, '');
  }
  
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const portStr = (port === 80 || port === 443 || port === '80' || port === '443') ? '' : `:${port}`;
  return `${protocol}://${host}${portStr}`;
}

export interface ProductImageAttributes {
  id: number;
  product_id: number;
  lightspeed_image_id: string | null;
  lightspeed_url: string | null;
  local_path: string | null;
  filename: string | null;
  is_featured: boolean;
  download_status: 'pending' | 'downloading' | 'done' | 'failed';
}

export type ProductImageCreationAttributes = Optional<
  ProductImageAttributes,
  'id' | 'lightspeed_image_id' | 'lightspeed_url' | 'local_path' | 'filename' | 'is_featured' | 'download_status'
>;

export class ProductImage extends Model<ProductImageAttributes, ProductImageCreationAttributes>
  implements ProductImageAttributes {
  declare id: number;
  declare product_id: number;
  declare lightspeed_image_id: string | null;
  declare lightspeed_url: string | null;
  declare local_path: string | null;
  declare filename: string | null;
  declare is_featured: boolean;
  declare download_status: 'pending' | 'downloading' | 'done' | 'failed';
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ProductImage.init(
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
    lightspeed_image_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lightspeed_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    local_path: {
      type: DataTypes.STRING,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('local_path');
        if (!rawValue) return null;
        
        let pathOnly = rawValue;
        if (rawValue.startsWith('http://') || rawValue.startsWith('https://')) {
          try {
            const urlObj = new URL(rawValue);
            pathOnly = urlObj.pathname;
          } catch (e) {
            const match = rawValue.match(/^https?:\/\/[^\/]+(\/.*)$/);
            if (match && match[1]) {
              pathOnly = match[1];
            }
          }
        }
        
        if (!pathOnly.startsWith('/')) {
          pathOnly = '/' + pathOnly;
        }
        
        const baseUrl = getBaseUrl();
        return `${baseUrl}${pathOnly}`;
      },
      set(value: string | null) {
        if (!value) {
          this.setDataValue('local_path', null);
          return;
        }
        
        let pathOnly = value;
        if (value.startsWith('http://') || value.startsWith('https://')) {
          try {
            const urlObj = new URL(value);
            pathOnly = urlObj.pathname;
          } catch (e) {
            const match = value.match(/^https?:\/\/[^\/]+(\/.*)$/);
            if (match && match[1]) {
              pathOnly = match[1];
            }
          }
        }
        
        if (!pathOnly.startsWith('/')) {
          pathOnly = '/' + pathOnly;
        }
        
        this.setDataValue('local_path', pathOnly);
      }
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_featured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    download_status: {
      type: DataTypes.ENUM('pending', 'downloading', 'done', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
  },
  {
    sequelize,
    tableName: 'product_images',
    modelName: 'ProductImage',
    timestamps: true,
    paranoid: false,
  }
);

export default ProductImage;
