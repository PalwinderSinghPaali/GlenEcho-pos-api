import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface VendorAttributes {
  id: number;
  lightspeed_vendor_id: string;
  name: string;
  archived: boolean;
  account_number: string | null;
  price_level: string | null;
  update_price: boolean;
  update_cost: boolean;
  update_description: boolean;
  share_sell_through: boolean;
  b2b_seller_uid: string | null;
  purchasing_currency_code: string | null;
  purchasing_currency_symbol: string | null;
  purchasing_currency_rate: number | null;
  rep_first_name: string | null;
  rep_last_name: string | null;
  address_1: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  zip: string | null;
  country: string | null;
  country_code: string | null;
  phone: string | null;
  phone_mobile: string | null;
  phone_fax: string | null;
  email: string | null;
  email_secondary: string | null;
  website: string | null;
  contact_id: string | null;
  custom: string | null;
  no_email: boolean;
  no_phone: boolean;
  no_mail: boolean;
}

export type VendorCreationAttributes = Optional<
  VendorAttributes,
  | 'id'
  | 'account_number'
  | 'price_level'
  | 'update_price'
  | 'update_cost'
  | 'update_description'
  | 'share_sell_through'
  | 'b2b_seller_uid'
  | 'purchasing_currency_code'
  | 'purchasing_currency_symbol'
  | 'purchasing_currency_rate'
  | 'rep_first_name'
  | 'rep_last_name'
  | 'address_1'
  | 'address_2'
  | 'city'
  | 'state'
  | 'state_code'
  | 'zip'
  | 'country'
  | 'country_code'
  | 'phone'
  | 'phone_mobile'
  | 'phone_fax'
  | 'email'
  | 'email_secondary'
  | 'website'
  | 'contact_id'
  | 'custom'
  | 'no_email'
  | 'no_phone'
  | 'no_mail'
>;

export class Vendor extends Model<VendorAttributes, VendorCreationAttributes> implements VendorAttributes {
  declare id: number;
  declare lightspeed_vendor_id: string;
  declare name: string;
  declare archived: boolean;
  declare account_number: string | null;
  declare price_level: string | null;
  declare update_price: boolean;
  declare update_cost: boolean;
  declare update_description: boolean;
  declare share_sell_through: boolean;
  declare b2b_seller_uid: string | null;
  declare purchasing_currency_code: string | null;
  declare purchasing_currency_symbol: string | null;
  declare purchasing_currency_rate: number | null;
  declare rep_first_name: string | null;
  declare rep_last_name: string | null;
  declare address_1: string | null;
  declare address_2: string | null;
  declare city: string | null;
  declare state: string | null;
  declare state_code: string | null;
  declare zip: string | null;
  declare country: string | null;
  declare country_code: string | null;
  declare phone: string | null;
  declare phone_mobile: string | null;
  declare phone_fax: string | null;
  declare email: string | null;
  declare email_secondary: string | null;
  declare website: string | null;
  declare contact_id: string | null;
  declare custom: string | null;
  declare no_email: boolean;
  declare no_phone: boolean;
  declare no_mail: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Vendor.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_vendor_id: {
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
    account_number: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    price_level: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    update_price: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    update_cost: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    update_description: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    share_sell_through: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    b2b_seller_uid: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    purchasing_currency_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    purchasing_currency_symbol: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    purchasing_currency_rate: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
      defaultValue: 1.0000,
      get() {
        const value = this.getDataValue('purchasing_currency_rate');
        return value ? parseFloat(value.toString()) : 1.0000;
      }
    },
    rep_first_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rep_last_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address_1: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address_2: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    zip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    country_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone_mobile: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone_fax: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email_secondary: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contact_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    custom: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    no_email: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    no_phone: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    no_mail: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'vendors',
    modelName: 'Vendor',
    timestamps: true,
  }
);

export default Vendor;
