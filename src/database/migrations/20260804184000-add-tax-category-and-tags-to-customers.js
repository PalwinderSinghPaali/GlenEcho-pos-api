'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add tax_category_id to customers table referencing tax_categories
    await queryInterface.addColumn('customers', 'tax_category_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'tax_categories',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // 2. Add tags field to customers table
    await queryInterface.addColumn('customers', 'tags', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    // 1. Remove tax_category_id from customers table
    await queryInterface.removeColumn('customers', 'tax_category_id');

    // 2. Remove tags field from customers table
    await queryInterface.removeColumn('customers', 'tags');
  },
};
