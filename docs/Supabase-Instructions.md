# Using a free, managed database

Prior to Heroku removing their free tier, it was smart to use Heroku's free tier to get a managed Postgres database. The current alternative is [Supabase](https://app.supabase.com/).

1. Create an account and a project.
1. Use a password. Make it *UNIQUE* since this password will be pasted into your environment variables
1. Go to
   ```
   https://supabase.com/dashboard/project/<YOUR_PROJECT_ID>/settings/database
   ```
1. At the bottom of the page, you'll find your database connection string. Copy it and replace `[YOUR-PASSWORD]` with your password that you used when creating this Supabase account.
1. You will use this connection string in your environment variables for your bot deployment. Your environment variables are set depending on where you deploy the app to. For cloud VMs, it'll be in a `.env` file, but for other platforms like Heroku, it'll be in their dashboard.

## Migration from Heroku

If you already have a database at Heroku, you can copy your database to Supabase.

You can use my instructions below, or the ones here:
https://github.com/supabase-community/heroku-to-supabase

1. Install `postgresql` on your computer
   - If on Windows, you can use Chocolatey:
     ```
     choco install postgresql
     ```
   - If on Mac, you can use Homebrew:
     ```
     brew install postgresql
     ```
1. Create a dump of your Heroku database (this does not delete it). Use the following command and full in your Heroku database connection string.
   ```
   pg_dump --clean --if-exists --quote-all-identifiers --no-owner --no-privileges --file ./dump.sql <YOUR_HEROKU_DATABASE_CONNECTION_STRING>
   ```
1. Import your Heroku database dump to Supabase. Fill in your Supabase project ID by finding it on the database settings page, or just looking in the URL when on your database settings.
   ```
   psql -h db.<YOUR_SUPABASE_PROJECT_ID>.supabase.co -p 5432 -d postgres -U postgres -f ./dump.sql
   ```
