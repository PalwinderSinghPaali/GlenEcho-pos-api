import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/database/connection';

export interface CustomerAttributes {
  id: number;
  lightspeed_customer_id: string | null;
  first_name: string;
  last_name: string;
  dob: Date | null;
  title: string | null;
  company: string | null;
  company_registration_number: string | null;
  vat_number: string | null;
  credit_account_id: number | null;
  customer_type_id: number | null;
  archived: boolean;
  address_1: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  zip: string | null;
  country: string | null;
  country_code: string | null;
  phone_mobile: string | null;
  phone_home: string | null;
  phone_work: string | null;
  email_primary: string | null;
  email_secondary: string | null;
  website: string | null;
  no_email: boolean;
  no_phone: boolean;
  no_mail: boolean;
  note: string | null;
  note_is_public: boolean;
  tax_category_id: number | null;
  discount_id: number | null;
  tags: string[] | null;
  custom: string | null;
  phone_pager: string | null;
  phone_fax: string | null;
  contact_id: string | null;
}

export type CustomerCreationAttributes = Optional<
  CustomerAttributes,
  | 'id'
  | 'lightspeed_customer_id'
  | 'dob'
  | 'title'
  | 'company'
  | 'company_registration_number'
  | 'vat_number'
  | 'credit_account_id'
  | 'customer_type_id'
  | 'archived'
  | 'address_1'
  | 'address_2'
  | 'city'
  | 'state'
  | 'state_code'
  | 'zip'
  | 'country'
  | 'country_code'
  | 'phone_mobile'
  | 'phone_home'
  | 'phone_work'
  | 'phone_pager'
  | 'phone_fax'
  | 'email_primary'
  | 'email_secondary'
  | 'website'
  | 'no_email'
  | 'no_phone'
  | 'no_mail'
  | 'note'
  | 'note_is_public'
  | 'tax_category_id'
  | 'discount_id'
  | 'tags'
  | 'custom'
  | 'contact_id'
>;

export class Customer extends Model<CustomerAttributes, CustomerCreationAttributes> implements CustomerAttributes {
  declare id: number;
  declare lightspeed_customer_id: string | null;
  declare first_name: string;
  declare last_name: string;
  declare dob: Date | null;
  declare title: string | null;
  declare company: string | null;
  declare company_registration_number: string | null;
  declare vat_number: string | null;
  declare credit_account_id: number | null;
  declare customer_type_id: number | null;
  declare archived: boolean;
  declare address_1: string | null;
  declare address_2: string | null;
  declare city: string | null;
  declare state: string | null;
  declare state_code: string | null;
  declare zip: string | null;
  declare country: string | null;
  declare country_code: string | null;
  declare phone_mobile: string | null;
  declare phone_home: string | null;
  declare phone_work: string | null;
  declare phone_pager: string | null;
  declare phone_fax: string | null;
  declare email_primary: string | null;
  declare email_secondary: string | null;
  declare website: string | null;
  declare no_email: boolean;
  declare no_phone: boolean;
  declare no_mail: boolean;
  declare note: string | null;
  declare note_is_public: boolean;
  declare tax_category_id: number | null;
  declare discount_id: number | null;
  declare tags: string[] | null;
  declare custom: string | null;
  declare contact_id: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Customer.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lightspeed_customer_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dob: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    company: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    company_registration_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    vat_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    credit_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'credit_accounts',
        key: 'id',
      },
    },
    customer_type_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'customer_types',
        key: 'id',
      },
    },
    archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    phone_mobile: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone_home: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone_work: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone_pager: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone_fax: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email_primary: {
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
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    note_is_public: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    tax_category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'tax_categories',
        key: 'id',
      },
    },
    discount_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'discounts',
        key: 'id',
      },
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
    },
    custom: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contact_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'customers',
    modelName: 'Customer',
    timestamps: true,
  }
);

export default Customer;
