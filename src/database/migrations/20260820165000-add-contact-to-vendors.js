'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('vendors');

    if (!tableInfo.address_1) {
      await queryInterface.addColumn('vendors', 'address_1', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.address_2) {
      await queryInterface.addColumn('vendors', 'address_2', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.city) {
      await queryInterface.addColumn('vendors', 'city', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.state) {
      await queryInterface.addColumn('vendors', 'state', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.state_code) {
      await queryInterface.addColumn('vendors', 'state_code', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.zip) {
      await queryInterface.addColumn('vendors', 'zip', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.country) {
      await queryInterface.addColumn('vendors', 'country', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.country_code) {
      await queryInterface.addColumn('vendors', 'country_code', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.phone) {
      await queryInterface.addColumn('vendors', 'phone', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.email) {
      await queryInterface.addColumn('vendors', 'email', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.website) {
      await queryInterface.addColumn('vendors', 'website', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('vendors');

    if (tableInfo.website) {
      await queryInterface.removeColumn('vendors', 'website');
    }
    if (tableInfo.email) {
      await queryInterface.removeColumn('vendors', 'email');
    }
    if (tableInfo.phone) {
      await queryInterface.removeColumn('vendors', 'phone');
    }
    if (tableInfo.country_code) {
      await queryInterface.removeColumn('vendors', 'country_code');
    }
    if (tableInfo.country) {
      await queryInterface.removeColumn('vendors', 'country');
    }
    if (tableInfo.zip) {
      await queryInterface.removeColumn('vendors', 'zip');
    }
    if (tableInfo.state_code) {
      await queryInterface.removeColumn('vendors', 'state_code');
    }
    if (tableInfo.state) {
      await queryInterface.removeColumn('vendors', 'state');
    }
    if (tableInfo.city) {
      await queryInterface.removeColumn('vendors', 'city');
    }
    if (tableInfo.address_2) {
      await queryInterface.removeColumn('vendors', 'address_2');
    }
    if (tableInfo.address_1) {
      await queryInterface.removeColumn('vendors', 'address_1');
    }
  },
};
