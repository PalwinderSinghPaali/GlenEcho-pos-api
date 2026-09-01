'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('permissions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      role_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      menu: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      create: {
        type: Sequelize.BOOLEAN,
        allowNull: false
      },
      edit: {
        type: Sequelize.BOOLEAN,
        allowNull: false
      },
      view: {
        type: Sequelize.BOOLEAN,
        allowNull: false
      },
      delete: {
        type: Sequelize.BOOLEAN,
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('permissions', ['role_id', 'menu'], { unique: true });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('permissions');
  }
};