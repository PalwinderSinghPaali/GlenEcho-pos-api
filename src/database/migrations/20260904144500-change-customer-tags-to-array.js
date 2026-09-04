'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE customers 
      ALTER COLUMN tags TYPE text[] 
      USING (
        CASE 
          WHEN tags IS NULL OR trim(tags) = '' THEN NULL
          ELSE string_to_array(regexp_replace(trim(tags), '\\s*,\\s*', ',', 'g'), ',')
        END
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE customers 
      ALTER COLUMN tags TYPE text 
      USING (
        CASE 
          WHEN tags IS NULL THEN NULL 
          ELSE array_to_string(tags, ', ') 
        END
      );
    `);
  },
};
