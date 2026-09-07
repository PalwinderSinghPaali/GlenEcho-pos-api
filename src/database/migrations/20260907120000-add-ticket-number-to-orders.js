'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'ticket_number', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addIndex('orders', ['ticket_number'], {
      name: 'orders_ticket_number_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('orders', 'orders_ticket_number_idx');
    await queryInterface.removeColumn('orders', 'ticket_number');
  },
};
