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

export interface HomepageBannerAttributes {
  id: number;
  title: string;
  description?: string | null;
  image_url?: string | null;
  color?: string | null;
  link_url?: string | null;
  button_text?: string | null;
  button_color?: string | null;
  button_text_color?: string | null;
  is_active: boolean;
  sort_order: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export type HomepageBannerCreationAttributes = Optional<
  HomepageBannerAttributes,
  | 'id'
  | 'description'
  | 'image_url'
  | 'color'
  | 'link_url'
  | 'button_text'
  | 'button_color'
  | 'button_text_color'
  | 'is_active'
  | 'sort_order'
>;

export class HomepageBanner
  extends Model<HomepageBannerAttributes, HomepageBannerCreationAttributes>
  implements HomepageBannerAttributes
{
  declare id: number;
  declare title: string;
  declare description: string | null;
  declare image_url: string | null;
  declare color: string | null;
  declare link_url: string | null;
  declare button_text: string | null;
  declare button_color: string | null;
  declare button_text_color: string | null;
  declare is_active: boolean;
  declare sort_order: number;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  declare readonly deletedAt: Date;
}

HomepageBanner.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    image_url: {
      type: DataTypes.STRING(512),
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('image_url');
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
          this.setDataValue('image_url', null);
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

        this.setDataValue('image_url', pathOnly);
      },
    },
    color: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    link_url: {
      type: DataTypes.STRING(512),
      allowNull: true,
    },
    button_text: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    button_color: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    button_text_color: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'homepage_banners',
    modelName: 'HomepageBanner',
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        fields: ['is_active'],
      },
      {
        fields: ['sort_order'],
      },
      {
        fields: ['created_at'],
      },
    ],
  }
);

export default HomepageBanner;
