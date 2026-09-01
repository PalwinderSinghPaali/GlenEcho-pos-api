'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_orders_status" ADD VALUE IF NOT EXISTS 'completed';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_orders_status" ADD VALUE IF NOT EXISTS 'shipped';
    `);
  },

  async down(queryInterface, Sequelize) {
    // PostgreSQL does not support removing values from an ENUM type easily.
    // No rollback query is needed since adding enum values is safe and non-breaking.
  }
};
