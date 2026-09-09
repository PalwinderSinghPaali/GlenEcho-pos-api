'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add lightspeed_create_time to products table
    const productTable = await queryInterface.describeTable('products');
    if (!productTable.lightspeed_create_time) {
      await queryInterface.addColumn('products', 'lightspeed_create_time', {
        type: Sequelize.DATE,
        allowNull: true,
      });
      await queryInterface.addIndex('products', ['lightspeed_create_time'], {
        name: 'idx_products_lightspeed_create_time',
      });
    }

    // 2. Create product_sales_stats table
    await queryInterface.createTable('product_sales_stats', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'products',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      units_sold_7d: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      units_sold_prior_7d: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      units_sold_30d: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      units_sold_all_time: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      revenue_30d: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
      },
      last_computed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Indexes for sorting/filtering landing page sections
    await queryInterface.addIndex('product_sales_stats', ['units_sold_7d'], {
      name: 'idx_product_sales_stats_units_7d',
    });
    await queryInterface.addIndex('product_sales_stats', ['units_sold_30d'], {
      name: 'idx_product_sales_stats_units_30d',
    });
    await queryInterface.addIndex('product_sales_stats', ['units_sold_all_time'], {
      name: 'idx_product_sales_stats_units_all_time',
    });

    // 3. Register scheduler job for daily sales velocity aggregation (3:00 AM off-peak)
    await queryInterface.bulkInsert('sync_scheduler_jobs', [
      {
        name: 'aggregate_sales_velocity',
        cron: '0 3 * * *', // Daily at 3:00 AM
        job_type: 'AGGREGATE_SALES_VELOCITY',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    // Remove scheduler job
    await queryInterface.bulkDelete('sync_scheduler_jobs', {
      name: 'aggregate_sales_velocity',
    });

    // Drop product_sales_stats table
    await queryInterface.dropTable('product_sales_stats');

    // Remove lightspeed_create_time column
    const productTable = await queryInterface.describeTable('products');
    if (productTable.lightspeed_create_time) {
      await queryInterface.removeIndex('products', 'idx_products_lightspeed_create_time');
      await queryInterface.removeColumn('products', 'lightspeed_create_time');
    }
  },
};
