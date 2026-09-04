'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('customers');

    if (!tableInfo.discount_id) {
      await queryInterface.addColumn('customers', 'discount_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'discounts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    if (!tableInfo.custom) {
      await queryInterface.addColumn('customers', 'custom', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.phone_pager) {
      await queryInterface.addColumn('customers', 'phone_pager', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.phone_fax) {
      await queryInterface.addColumn('customers', 'phone_fax', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.contact_id) {
      await queryInterface.addColumn('customers', 'contact_id', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('customers');

    if (tableInfo.contact_id) {
      await queryInterface.removeColumn('customers', 'contact_id');
    }
    if (tableInfo.phone_fax) {
      await queryInterface.removeColumn('customers', 'phone_fax');
    }
    if (tableInfo.phone_pager) {
      await queryInterface.removeColumn('customers', 'phone_pager');
    }
    if (tableInfo.custom) {
      await queryInterface.removeColumn('customers', 'custom');
    }
    if (tableInfo.discount_id) {
      await queryInterface.removeColumn('customers', 'discount_id');
    }
  },
};
