'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop the old simple products table first (safe drop for migration refactoring)
    await queryInterface.dropTable('products', { cascade: true }).catch(() => {});

    await queryInterface.createTable('products', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      lightspeed_item_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      product_matrix_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'product_matrices',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      brand_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'brands',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      system_sku: {
        type: Sequelize.STRING,
        allowNull: true
      },
      custom_sku: {
        type: Sequelize.STRING,
        allowNull: true
      },
      upc: {
        type: Sequelize.STRING,
        allowNull: true
      },
      ean: {
        type: Sequelize.STRING,
        allowNull: true
      },
      manufacturer_sku: {
        type: Sequelize.STRING,
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      msrp: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      online_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      default_cost: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      qoh: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      discountable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      taxable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      item_type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'Item'
      },
      publish_to_ecom: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      serialized: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      attribute_1_value: {
        type: Sequelize.STRING,
        allowNull: true
      },
      attribute_2_value: {
        type: Sequelize.STRING,
        allowNull: true
      },
      attribute_3_value: {
        type: Sequelize.STRING,
        allowNull: true
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      display_note: {
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

    // Add indexes for common queries
    await queryInterface.addIndex('products', ['lightspeed_item_id']);
    await queryInterface.addIndex('products', ['product_matrix_id']);
    await queryInterface.addIndex('products', ['brand_id']);
    await queryInterface.addIndex('products', ['category_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('products');
  }
};
