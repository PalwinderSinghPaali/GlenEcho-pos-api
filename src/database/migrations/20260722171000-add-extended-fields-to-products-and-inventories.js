'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add fields to products table
    await queryInterface.addColumn('products', 'avg_cost', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
    });

    // 2. Add fields to product_inventories table
    await queryInterface.addColumn('product_inventories', 'lightspeed_item_shop_id', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('product_inventories', 'total_value', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
    });
    await queryInterface.addColumn('product_inventories', 'reserved', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('product_inventories', 'layaway', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('product_inventories', 'special_order', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('product_inventories', 'workorder', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('product_inventories', 'total_sale_value', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
    });
  },

  async down(queryInterface) {
    // 1. Remove fields from products table
    await queryInterface.removeColumn('products', 'avg_cost');

    // 2. Remove fields from product_inventories table
    await queryInterface.removeColumn('product_inventories', 'lightspeed_item_shop_id');
    await queryInterface.removeColumn('product_inventories', 'total_value');
    await queryInterface.removeColumn('product_inventories', 'reserved');
    await queryInterface.removeColumn('product_inventories', 'layaway');
    await queryInterface.removeColumn('product_inventories', 'special_order');
    await queryInterface.removeColumn('product_inventories', 'workorder');
    await queryInterface.removeColumn('product_inventories', 'total_sale_value');
  },
};
