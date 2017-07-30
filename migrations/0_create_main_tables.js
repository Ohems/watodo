exports.up = knex =>
  knex.schema
    .createTable('responsibilties', (table) => {
      table.increments('responsibilties_id');
      table.text('title').notNullable();
    })
    .createTable('assignments', (table) => {
      table.increments('assignments_id');
      table.integer('responsibilty_id').unsigned().notNullable();

      table.foreign('responsibilties_id').references('responsibilties.responsibilties_id');
    })
    .createTable('event_series', (table) => {
      table.increments('event_series_id');
      table.text('title').notNullable();
      table.text('desc');
      table.jsonb('rules').notNullable();
      table.timestamps();
      table.boolean('visible').notNullable().defaultTo(true);
    })
    .createTable('events', (table) => {
      table.increments('events_id');
      table.text('title').notNullable();
      table.text('desc');
      table.integer('users_id').unsigned();
      table.integer('event_series_id').unsigned();
      table.specificType('assignments', 'serial[]');
      table.boolean('all_day').notNullable().defaultTo(false);
      table.timestamp('start').notNullable();
      table.timestamp('end').notNullable();
      table.timestamps();
      table.boolean('visible').notNullable().defaultTo(true);

      table.foreign('users_id').references('users.users_id');
      table.foreign('event_series_id').references('event_series.event_series_id');
    })
    .createTable('email_domains', (table) => {
      table.increments('email_domains_id');
      table.string('name').notNullable();

      table.unique('name');
    })
    .createTable('users', (table) => {
      table.increments('users_id');
      table.string('name');
      table.string('email_local', 64).notNullable();
      table.integer('email_domains_id').unsigned().notNullable();
      table.string('phone', 15);
      table.timestamps();
      table.text('profile');
      table.integer('responsibilty_id').unsigned().notNullable();
      table.boolean('active').notNullable().defaultTo(true);
      table.boolean('visible').notNullable().defaultTo(true);

      table.foreign('email_domains_id').references('email_domains.email_domains_id');
      table.foreign('responsibilties_id').references('responsibilties.responsibilties_id');
    });

exports.down = knex =>
  knex.schema
    .dropTable('users')
    .dropTable('email_domains')
    .dropTable('events')
    .dropTable('event_series')
    .dropTable('assignments')
    .dropTable('responsibilties');
