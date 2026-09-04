'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('sync_scheduler_jobs', [
      {
        name: 'poll_shipments',
        cron: '0 */2 * * *', // every 2 hours
        job_type: 'POLL_SHIPMENTS',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'cleanup_abandoned_checkouts',
        cron: '*/30 * * * *', // every 30 minutes
        job_type: 'CLEANUP_ABANDONED_CHECKOUTS',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    const { Op } = Sequelize;
    await queryInterface.bulkDelete('sync_scheduler_jobs', {
      name: {
        [Op.in]: ['poll_shipments', 'cleanup_abandoned_checkouts'],
      },
    });
  },
};
