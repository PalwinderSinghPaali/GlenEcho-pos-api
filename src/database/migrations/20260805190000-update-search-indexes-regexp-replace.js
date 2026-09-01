'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    // 1. Recreate trigger function to use regexp_replace to clean non-alphanumeric/non-space chars before to_tsvector
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION products_tsv_trigger() RETURNS trigger AS $$
      BEGIN
        new.tsv_search := to_tsvector('english', 
          regexp_replace(coalesce(new.description, ''), '[^a-zA-Z0-9\\s]', ' ', 'g') || ' ' || 
          regexp_replace(coalesce(new.system_sku, ''), '[^a-zA-Z0-9\\s]', ' ', 'g') || ' ' || 
          regexp_replace(coalesce(new.custom_sku, ''), '[^a-zA-Z0-9\\s]', ' ', 'g') || ' ' || 
          regexp_replace(coalesce(new.manufacturer_sku, ''), '[^a-zA-Z0-9\\s]', ' ', 'g')
        );
        RETURN new;
      END
      $$ LANGUAGE plpgsql;
    `);

    // 2. Re-populate tsv_search for all existing product rows
    await sequelize.query(`
      UPDATE products SET tsv_search = to_tsvector('english', 
        regexp_replace(coalesce(description, ''), '[^a-zA-Z0-9\\s]', ' ', 'g') || ' ' || 
        regexp_replace(coalesce(system_sku, ''), '[^a-zA-Z0-9\\s]', ' ', 'g') || ' ' || 
        regexp_replace(coalesce(custom_sku, ''), '[^a-zA-Z0-9\\s]', ' ', 'g') || ' ' || 
        regexp_replace(coalesce(manufacturer_sku, ''), '[^a-zA-Z0-9\\s]', ' ', 'g')
      );
    `);
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    // Restore original trigger function
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION products_tsv_trigger() RETURNS trigger AS $$
      BEGIN
        new.tsv_search := to_tsvector('english', 
          coalesce(new.description, '') || ' ' || 
          coalesce(new.system_sku, '') || ' ' || 
          coalesce(new.custom_sku, '') || ' ' || 
          coalesce(new.manufacturer_sku, '')
        );
        RETURN new;
      END
      $$ LANGUAGE plpgsql;
    `);

    // Restore original values
    await sequelize.query(`
      UPDATE products SET tsv_search = to_tsvector('english', 
        coalesce(description, '') || ' ' || 
        coalesce(system_sku, '') || ' ' || 
        coalesce(custom_sku, '') || ' ' || 
        coalesce(manufacturer_sku, '')
      );
    `);
  }
};
