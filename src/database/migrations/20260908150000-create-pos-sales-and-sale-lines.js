'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create pos_sales table
    await queryInterface.createTable('pos_sales', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      lightspeed_sale_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      shop_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'shops',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      register_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'registers',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      employee_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'employees',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'customers',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      completed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      voided: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      subtotal: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      tax_total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      discount_total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      sale_time: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      lightspeed_updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex('pos_sales', ['sale_time'], {
      name: 'idx_pos_sales_sale_time',
    });
    await queryInterface.addIndex('pos_sales', ['completed', 'voided'], {
      name: 'idx_pos_sales_completed_voided',
    });
    await queryInterface.addIndex('pos_sales', ['customer_id'], {
      name: 'idx_pos_sales_customer_id',
    });

    // 2. Create pos_sale_lines table
    await queryInterface.createTable('pos_sale_lines', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      sale_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'pos_sales',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      lightspeed_sale_line_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'products',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      lightspeed_item_id: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      unit_quantity: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 1.0,
      },
      unit_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      calc_subtotal: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      calc_total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      tax: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex('pos_sale_lines', ['product_id'], {
      name: 'idx_pos_sale_lines_product_id',
    });
    await queryInterface.addIndex('pos_sale_lines', ['sale_id'], {
      name: 'idx_pos_sale_lines_sale_id',
    });
    await queryInterface.addIndex('pos_sale_lines', ['lightspeed_item_id'], {
      name: 'idx_pos_sale_lines_item_id',
    });

    // 3. Register scheduler job for incremental POS sales polling (every hour)
    await queryInterface.bulkInsert('sync_scheduler_jobs', [
      {
        name: 'poll_pos_sales',
        cron: '0 * * * *', // Every hour at minute 0
        job_type: 'POLL_POS_SALES',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    // Remove scheduler job
    await queryInterface.bulkDelete('sync_scheduler_jobs', {
      name: 'poll_pos_sales',
    });

    // Drop tables
    await queryInterface.dropTable('pos_sale_lines');
    await queryInterface.dropTable('pos_sales');
  },
};
