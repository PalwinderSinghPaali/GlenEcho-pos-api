'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    
    // 1. Add tsv_search column of type TSVECTOR to products table
    await sequelize.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS tsv_search TSVECTOR;');

    // 2. Populate tsv_search for all existing product rows
    await sequelize.query(`
      UPDATE products SET tsv_search = to_tsvector('english', 
        coalesce(description, '') || ' ' || 
        coalesce(system_sku, '') || ' ' || 
        coalesce(custom_sku, '') || ' ' || 
        coalesce(manufacturer_sku, '')
      );
    `);

    // 3. Create PL/pgSQL trigger function to auto-update tsv_search on insert or update
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

    // 4. Bind trigger function to table BEFORE INSERT OR UPDATE
    await sequelize.query(`
      DROP TRIGGER IF EXISTS products_tsv_update ON products;
      CREATE TRIGGER products_tsv_update BEFORE INSERT OR UPDATE ON products
        FOR EACH ROW EXECUTE FUNCTION products_tsv_trigger();
    `);

    // 5. Create a standard GIN index on the simple tsv_search column (Sequelize parsing safe)
    await sequelize.query('CREATE INDEX IF NOT EXISTS products_tsv_idx ON products USING GIN (tsv_search);');
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    
    // Drop resources in reverse order
    await sequelize.query('DROP INDEX IF EXISTS products_tsv_idx;');
    await sequelize.query('DROP TRIGGER IF EXISTS products_tsv_update ON products;');
    await sequelize.query('DROP FUNCTION IF EXISTS products_tsv_trigger();');
    await sequelize.query('ALTER TABLE products DROP COLUMN IF EXISTS tsv_search;');
  }
};
