'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('product_matrices');

    if (!tableInfo.price) {
      await queryInterface.addColumn('product_matrices', 'price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      });
    }

    if (!tableInfo.msrp) {
      await queryInterface.addColumn('product_matrices', 'msrp', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      });
    }

    if (!tableInfo.online_price) {
      await queryInterface.addColumn('product_matrices', 'online_price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('product_matrices');

    if (tableInfo.online_price) {
      await queryInterface.removeColumn('product_matrices', 'online_price');
    }
    if (tableInfo.msrp) {
      await queryInterface.removeColumn('product_matrices', 'msrp');
    }
    if (tableInfo.price) {
      await queryInterface.removeColumn('product_matrices', 'price');
    }
  },
};
