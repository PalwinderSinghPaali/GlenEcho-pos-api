'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('lightspeed_configs', 'read_only_mode', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true, // Always starts in read-only mode to protect live POS
      comment: 'When true, all outbound PUSH/write jobs to Lightspeed are blocked. Safe-guard for live production POS.',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('lightspeed_configs', 'read_only_mode');
  },
};
