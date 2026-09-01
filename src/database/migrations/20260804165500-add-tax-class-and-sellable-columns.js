'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add fields to products table
    await queryInterface.addColumn('products', 'tax_class_id', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'tax_class_name', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // 2. Add sellable field to product_inventories table
    await queryInterface.addColumn('product_inventories', 'sellable', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    // 1. Remove fields from products table
    await queryInterface.removeColumn('products', 'tax_class_id');
    await queryInterface.removeColumn('products', 'tax_class_name');

    // 2. Remove sellable field from product_inventories table
    await queryInterface.removeColumn('product_inventories', 'sellable');
  },
};
