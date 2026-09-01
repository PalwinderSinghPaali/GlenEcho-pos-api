'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('lightspeed_entity_maps', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      entity_type: {
        type: Sequelize.STRING,
        allowNull: false
      },
      lightspeed_id: {
        type: Sequelize.STRING,
        allowNull: false
      },
      local_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      last_sync: {
        type: Sequelize.DATE,
        allowNull: true
      },
      hash: {
        type: Sequelize.STRING,
        allowNull: true
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

    // Item #1: Add Unique constraint
    await queryInterface.addConstraint('lightspeed_entity_maps', {
      fields: ['entity_type', 'lightspeed_id'],
      type: 'unique',
      name: 'unique_entity_type_lightspeed_id'
    });

    await queryInterface.addIndex('lightspeed_entity_maps', ['entity_type', 'lightspeed_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('lightspeed_entity_maps');
  }
};
