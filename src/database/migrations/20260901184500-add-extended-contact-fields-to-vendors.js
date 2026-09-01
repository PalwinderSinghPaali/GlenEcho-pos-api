'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('vendors');

    if (!tableInfo.contact_id) {
      await queryInterface.addColumn('vendors', 'contact_id', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.custom) {
      await queryInterface.addColumn('vendors', 'custom', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.phone_mobile) {
      await queryInterface.addColumn('vendors', 'phone_mobile', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.phone_fax) {
      await queryInterface.addColumn('vendors', 'phone_fax', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.email_secondary) {
      await queryInterface.addColumn('vendors', 'email_secondary', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.no_email) {
      await queryInterface.addColumn('vendors', 'no_email', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!tableInfo.no_phone) {
      await queryInterface.addColumn('vendors', 'no_phone', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!tableInfo.no_mail) {
      await queryInterface.addColumn('vendors', 'no_mail', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('vendors');

    if (tableInfo.no_mail) {
      await queryInterface.removeColumn('vendors', 'no_mail');
    }
    if (tableInfo.no_phone) {
      await queryInterface.removeColumn('vendors', 'no_phone');
    }
    if (tableInfo.no_email) {
      await queryInterface.removeColumn('vendors', 'no_email');
    }
    if (tableInfo.email_secondary) {
      await queryInterface.removeColumn('vendors', 'email_secondary');
    }
    if (tableInfo.phone_fax) {
      await queryInterface.removeColumn('vendors', 'phone_fax');
    }
    if (tableInfo.phone_mobile) {
      await queryInterface.removeColumn('vendors', 'phone_mobile');
    }
    if (tableInfo.custom) {
      await queryInterface.removeColumn('vendors', 'custom');
    }
    if (tableInfo.contact_id) {
      await queryInterface.removeColumn('vendors', 'contact_id');
    }
  },
};
