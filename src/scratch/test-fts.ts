import sequelize from '../database/connection';

async function run() {
  try {
    const description1 = 'Alison Sheri #A47407 - Reversible Denim Pants - Indigo/Floral- XS-X';
    const description2 = 'Audrey Pull-On Slim Ankle - Black - 12';

    // SQL expression to replace all non-alphanumeric and non-space characters with a space
    const cleanSql = `regexp_replace(:desc, '[^a-zA-Z0-9\\s]', ' ', 'g')`;

    const [res1]: any = await sequelize.query(
      `SELECT to_tsvector('english', ${cleanSql}) AS tsv`,
      { replacements: { desc: description1 } }
    );
    console.log('Cleaned tsv_search tokens for Description 1:');
    console.log(res1[0].tsv);

    const [res2]: any = await sequelize.query(
      `SELECT to_tsvector('english', ${cleanSql}) AS tsv`,
      { replacements: { desc: description2 } }
    );
    console.log('\nCleaned tsv_search tokens for Description 2:');
    console.log(res2[0].tsv);

    // Let's test query matches
    const queries = [
      'Alison Sheri #A47407 - Reversible Denim Pants - Indigo/Floral- XS-X',
      'Audrey Pull-On Slim Ankle - Black - 12',
      'Audrey Pull-On',
      'Indigo/Floral',
      'Alison Sheri #A47407',
      'Floral',
      'Polyester',
    ];

    for (const q of queries) {
      console.log(`\n==========================================`);
      console.log(`QUERY: "${q}"`);

      // Query side: replace non-alphanumeric/non-space with space, split, make prefix query
      const cleanQ = q.trim().toLowerCase().replace(/[^a-zA-Z0-9\s]/g, ' ');
      const words = cleanQ.split(/\s+/).filter(Boolean);
      const tsquery = words.map((w) => `${w.replace(/['":*&|!]/g, '')}:*`).join(' & ');
      console.log(`tsquery: `, tsquery);

      if (tsquery) {
        const [match1]: any = await sequelize.query(
          `SELECT to_tsvector('english', ${cleanSql}) @@ to_tsquery('english', :q) AS matches`,
          { replacements: { desc: description1, q: tsquery } }
        );
        console.log(`Matches Desc 1:`, match1[0].matches);

        const [match2]: any = await sequelize.query(
          `SELECT to_tsvector('english', ${cleanSql}) @@ to_tsquery('english', :q) AS matches`,
          { replacements: { desc: description2, q: tsquery } }
        );
        console.log(`Matches Desc 2:`, match2[0].matches);
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

run();
