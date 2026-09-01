'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sync_scheduler_jobs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      cron: {
        type: Sequelize.STRING,
        allowNull: false
      },
      job_type: {
        type: Sequelize.STRING,
        allowNull: false
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      last_run_at: {
        type: Sequelize.DATE,
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

    // Seed default scheduler jobs immediately so they are configured as data
    await queryInterface.bulkInsert('sync_scheduler_jobs', [
      {
        name: 'poll_inventory_fast',
        cron: '*/30 * * * * *', // every 30 seconds
        job_type: 'POLL_INVENTORY',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'poll_catalog_slow',
        cron: '*/10 * * * *', // every 10 minutes
        job_type: 'POLL_CATALOG',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'nightly_reconciliation',
        cron: '0 3 * * *', // daily at 3:00 AM
        job_type: 'RECONCILE_ALL',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sync_scheduler_jobs');
  }
};
