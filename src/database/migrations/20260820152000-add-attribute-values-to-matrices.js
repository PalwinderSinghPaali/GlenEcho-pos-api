'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('product_matrices');

    if (!tableInfo.attribute_1_values) {
      await queryInterface.addColumn('product_matrices', 'attribute_1_values', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
      });
    }

    if (!tableInfo.attribute_2_values) {
      await queryInterface.addColumn('product_matrices', 'attribute_2_values', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
      });
    }

    if (!tableInfo.attribute_3_values) {
      await queryInterface.addColumn('product_matrices', 'attribute_3_values', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('product_matrices');

    if (tableInfo.attribute_3_values) {
      await queryInterface.removeColumn('product_matrices', 'attribute_3_values');
    }
    if (tableInfo.attribute_2_values) {
      await queryInterface.removeColumn('product_matrices', 'attribute_2_values');
    }
    if (tableInfo.attribute_1_values) {
      await queryInterface.removeColumn('product_matrices', 'attribute_1_values');
    }
  },
};
