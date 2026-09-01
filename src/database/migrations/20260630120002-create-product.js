'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
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
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      qoh: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('products', ['lightspeed_item_id']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('products');
  }
};
