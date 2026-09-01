'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create customer_types table
    await queryInterface.createTable('customer_types', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      lightspeed_customer_type_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      tax_category_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      discount_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // 2. Create credit_accounts table
    await queryInterface.createTable('credit_accounts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      lightspeed_credit_account_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      description: {
        type: Sequelize.STRING,
        allowNull: true
      },
      gift_card: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      balance: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // 3. Create customers table
    await queryInterface.createTable('customers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      lightspeed_customer_id: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      },
      first_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      last_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      dob: {
        type: Sequelize.DATE,
        allowNull: true
      },
      title: {
        type: Sequelize.STRING,
        allowNull: true
      },
      company: {
        type: Sequelize.STRING,
        allowNull: true
      },
      company_registration_number: {
        type: Sequelize.STRING,
        allowNull: true
      },
      vat_number: {
        type: Sequelize.STRING,
        allowNull: true
      },
      credit_account_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'credit_accounts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      customer_type_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'customer_types',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      archived: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      address_1: {
        type: Sequelize.STRING,
        allowNull: true
      },
      address_2: {
        type: Sequelize.STRING,
        allowNull: true
      },
      city: {
        type: Sequelize.STRING,
        allowNull: true
      },
      state: {
        type: Sequelize.STRING,
        allowNull: true
      },
      state_code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      zip: {
        type: Sequelize.STRING,
        allowNull: true
      },
      country: {
        type: Sequelize.STRING,
        allowNull: true
      },
      country_code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      phone_mobile: {
        type: Sequelize.STRING,
        allowNull: true
      },
      phone_home: {
        type: Sequelize.STRING,
        allowNull: true
      },
      phone_work: {
        type: Sequelize.STRING,
        allowNull: true
      },
      email_primary: {
        type: Sequelize.STRING,
        allowNull: true
      },
      email_secondary: {
        type: Sequelize.STRING,
        allowNull: true
      },
      website: {
        type: Sequelize.STRING,
        allowNull: true
      },
      no_email: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      no_phone: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      no_mail: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      note_is_public: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('customers');
    await queryInterface.dropTable('credit_accounts');
    await queryInterface.dropTable('customer_types');
  }
};
