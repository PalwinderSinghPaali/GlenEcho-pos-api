'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('homepage_banners', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      image_url: {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      color: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      link_url: {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      button_text: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      button_color: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      button_text_color: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('homepage_banners', ['is_active']);
    await queryInterface.addIndex('homepage_banners', ['sort_order']);
    await queryInterface.addIndex('homepage_banners', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('homepage_banners');
  },
};
