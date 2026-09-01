'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('lightspeed_sync_states', {
      entity_type: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false
      },
      last_synced_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      last_cursor_ts: {
        type: Sequelize.STRING,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('idle', 'running', 'error'),
        allowNull: false,
        defaultValue: 'idle'
      },
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      records_processed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
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
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('lightspeed_sync_states');
  }
};
