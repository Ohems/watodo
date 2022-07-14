exports.up = knex =>
  knex.schema
    .createTable('jobs', (table) => {
      table.increments('jobs_id');
      table.text('title').notNullable();
    })
    .createTable('users', (table) => {
      table.increments('users_id');
      table.string('name');
      table.string('email').notNullable();
      table.jsonb('contacts');
      table.timestamps();
      table.text('profile');
      table.boolean('active').notNullable().defaultTo(true);
      table.boolean('visible').notNullable().defaultTo(true);
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
      table.boolean('all_day').notNullable().defaultTo(false);
      table.timestamp('start').notNullable();
      table.timestamp('end').notNullable();
      table.timestamps();
      table.boolean('visible').notNullable().defaultTo(true);

      table.foreign('users_id').references('users.users_id');
      table.foreign('event_series_id').references('event_series.event_series_id');
    })
    .createTable('responsibilities', (table) => {
      table.increments('responsibilities_id');
      table.integer('users_id').unsigned().notNullable();
      table.integer('jobs_id').unsigned().notNullable();

      table.foreign('users_id').references('users.users_id');
      table.foreign('jobs_id').references('jobs.jobs_id');
    })
    .createTable('assignments', (table) => {
      table.increments('assignments_id');
      table.integer('users_id').unsigned().notNullable();
      table.integer('jobs_id').unsigned().notNullable();
      table.integer('events_id').unsigned().notNullable();

      table.foreign('users_id').references('users.users_id');
      table.foreign('jobs_id').references('jobs.jobs_id');
      table.foreign('events_id').references('events.events_id');
    });

exports.down = knex =>
  knex.schema
    .dropTable('assignments')
    .dropTable('responsibilities')
    .dropTable('events')
    .dropTable('event_series')
    .dropTable('users')
    .dropTable('jobs');
