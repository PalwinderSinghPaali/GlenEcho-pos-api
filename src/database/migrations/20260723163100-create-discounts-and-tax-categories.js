'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create discounts table
    await queryInterface.createTable('discounts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      lightspeed_discount_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      discount_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      discount_percent: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0.0000
      },
      require_customer: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      archived: {
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

    // 2. Create tax_categories table
    await queryInterface.createTable('tax_categories', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      lightspeed_tax_category_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      is_tax_inclusive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      tax_1_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      tax_2_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      tax_1_rate: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0.0000
      },
      tax_2_rate: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0.0000
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

    // 3. Alter customer_types table to add foreign key references
    // Clean up any old invalid IDs in customer_types table
    await queryInterface.sequelize.query('UPDATE customer_types SET discount_id = NULL, tax_category_id = NULL');

    await queryInterface.changeColumn('customer_types', 'discount_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'discounts',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.changeColumn('customer_types', 'tax_category_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'tax_categories',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface, Sequelize) {
    // 1. Remove constraints and restore columns on customer_types table
    await queryInterface.changeColumn('customer_types', 'discount_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    await queryInterface.changeColumn('customer_types', 'tax_category_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    // 2. Drop tables
    await queryInterface.dropTable('tax_categories');
    await queryInterface.dropTable('discounts');
  }
};
