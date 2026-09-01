'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('vendors', 'account_number', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: '',
    });
    await queryInterface.addColumn('vendors', 'price_level', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: '',
    });
    await queryInterface.addColumn('vendors', 'update_price', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('vendors', 'update_cost', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('vendors', 'update_description', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('vendors', 'share_sell_through', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('vendors', 'b2b_seller_uid', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: '',
    });
    await queryInterface.addColumn('vendors', 'purchasing_currency_code', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('vendors', 'purchasing_currency_symbol', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('vendors', 'purchasing_currency_rate', {
      type: Sequelize.DECIMAL(10, 4),
      allowNull: true,
      defaultValue: 1.0000,
    });
    await queryInterface.addColumn('vendors', 'rep_first_name', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('vendors', 'rep_last_name', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('vendors', 'account_number');
    await queryInterface.removeColumn('vendors', 'price_level');
    await queryInterface.removeColumn('vendors', 'update_price');
    await queryInterface.removeColumn('vendors', 'update_cost');
    await queryInterface.removeColumn('vendors', 'update_description');
    await queryInterface.removeColumn('vendors', 'share_sell_through');
    await queryInterface.removeColumn('vendors', 'b2b_seller_uid');
    await queryInterface.removeColumn('vendors', 'purchasing_currency_code');
    await queryInterface.removeColumn('vendors', 'purchasing_currency_symbol');
    await queryInterface.removeColumn('vendors', 'purchasing_currency_rate');
    await queryInterface.removeColumn('vendors', 'rep_first_name');
    await queryInterface.removeColumn('vendors', 'rep_last_name');
  }
};
