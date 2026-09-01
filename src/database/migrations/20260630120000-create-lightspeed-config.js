'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('lightspeed_configs', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.INTEGER,
        defaultValue: 1
      },
      access_token: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      access_token_expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      last_sync_time: {
        type: Sequelize.DATE,
        allowNull: true
      },
      account_id: {
        type: Sequelize.STRING,
        allowNull: true
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
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('lightspeed_configs');
  }
};
