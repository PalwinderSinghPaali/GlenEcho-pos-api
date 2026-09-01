'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create price_levels table
    const tableNames = await queryInterface.showAllTables();
    if (!tableNames.includes('price_levels')) {
      await queryInterface.createTable('price_levels', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        lightspeed_price_level_id: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        calculation_type: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        value: {
          type: Sequelize.DECIMAL(10, 4),
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      });
    }

    // 2. Create currency_rates table
    if (!tableNames.includes('currency_rates')) {
      await queryInterface.createTable('currency_rates', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        lightspeed_currency_rate_id: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
        },
        code: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        symbol: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        rate: {
          type: Sequelize.DECIMAL(10, 4),
          allowNull: false,
          defaultValue: 1.0000,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('currency_rates');
    await queryInterface.dropTable('price_levels');
  },
};
