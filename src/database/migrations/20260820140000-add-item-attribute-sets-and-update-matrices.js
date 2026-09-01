'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create item_attribute_sets table if it doesn't exist
    const tableExists = await queryInterface.sequelize.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'item_attribute_sets'",
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (tableExists.length === 0) {
      await queryInterface.createTable('item_attribute_sets', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        lightspeed_attribute_set_id: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        attribute_name_1: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        attribute_name_2: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        attribute_name_3: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        system: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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
    }

    // 2. Add columns to product_matrices table if they don't exist
    const tableInfo = await queryInterface.describeTable('product_matrices');

    if (!tableInfo.tax) {
      await queryInterface.addColumn('product_matrices', 'tax', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }

    if (!tableInfo.default_cost) {
      await queryInterface.addColumn('product_matrices', 'default_cost', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      });
    }

    if (!tableInfo.item_type) {
      await queryInterface.addColumn('product_matrices', 'item_type', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'default',
      });
    }

    if (!tableInfo.serialized) {
      await queryInterface.addColumn('product_matrices', 'serialized', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!tableInfo.model_year) {
      await queryInterface.addColumn('product_matrices', 'model_year', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!tableInfo.archived) {
      await queryInterface.addColumn('product_matrices', 'archived', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!tableInfo.tax_class_id) {
      await queryInterface.addColumn('product_matrices', 'tax_class_id', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.tax_class_name) {
      await queryInterface.addColumn('product_matrices', 'tax_class_name', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.item_attribute_set_id) {
      await queryInterface.addColumn('product_matrices', 'item_attribute_set_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'item_attribute_sets',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
  },

  async down(queryInterface) {
    // 1. Remove columns from product_matrices if they exist
    const tableInfo = await queryInterface.describeTable('product_matrices');

    if (tableInfo.item_attribute_set_id) {
      await queryInterface.removeColumn('product_matrices', 'item_attribute_set_id');
    }
    if (tableInfo.tax_class_name) {
      await queryInterface.removeColumn('product_matrices', 'tax_class_name');
    }
    if (tableInfo.tax_class_id) {
      await queryInterface.removeColumn('product_matrices', 'tax_class_id');
    }
    if (tableInfo.archived) {
      await queryInterface.removeColumn('product_matrices', 'archived');
    }
    if (tableInfo.model_year) {
      await queryInterface.removeColumn('product_matrices', 'model_year');
    }
    if (tableInfo.serialized) {
      await queryInterface.removeColumn('product_matrices', 'serialized');
    }
    if (tableInfo.item_type) {
      await queryInterface.removeColumn('product_matrices', 'item_type');
    }
    if (tableInfo.default_cost) {
      await queryInterface.removeColumn('product_matrices', 'default_cost');
    }
    if (tableInfo.tax) {
      await queryInterface.removeColumn('product_matrices', 'tax');
    }

    // 2. Drop item_attribute_sets table if it exists
    const tableExists = await queryInterface.sequelize.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'item_attribute_sets'",
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    if (tableExists.length > 0) {
      await queryInterface.dropTable('item_attribute_sets');
    }
  },
};
