'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create employees table
    await queryInterface.createTable('employees', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      lightspeed_employee_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      first_name: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      },
      last_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      lock_out: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      archived: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      contact_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      clock_in_employee_hours_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      employee_role_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      employee_role_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      limit_to_shop_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'shops',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      lightspeed_limit_to_shop_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      last_shop_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'shops',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      lightspeed_last_shop_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      last_sale_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      last_register_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      time_stamp: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    // 2. Create registers table
    await queryInterface.createTable('registers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      lightspeed_register_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      open: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      open_time: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      tip_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      lightspeed_shop_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      open_employee_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'employees',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      lightspeed_open_employee_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      cc_terminal_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      archived: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    // Indexes for fast lookup
    await queryInterface.addIndex('employees', ['lightspeed_employee_id']);
    await queryInterface.addIndex('employees', ['last_shop_id']);
    await queryInterface.addIndex('registers', ['lightspeed_register_id']);
    await queryInterface.addIndex('registers', ['shop_id']);
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('registers');
    await queryInterface.dropTable('employees');
  },
};
