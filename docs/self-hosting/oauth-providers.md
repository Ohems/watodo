# OAuth login providers

Watodo has no passwords: users log in through external identity providers, and one
Watodo account can have several providers linked (managed by the user on the
Account page, `/account`).

## Setup per provider

1. Create an application at the provider:
   - Discord: https://discord.com/developers/applications
   - Google: https://console.cloud.google.com/apis/credentials (OAuth client)
   - Microsoft: https://entra.microsoft.com (App registrations)
2. Register the redirect URI. It is always:

   ```
   ${BASE_URL}/api/v1/auth/<provider>/callback
   ```

   where `<provider>` is `discord`, `google` or `microsoft`. Example: with
   `BASE_URL=https://api.example.com`, the Discord redirect URI is
   `https://api.example.com/api/v1/auth/discord/callback`.
3. Put the credentials in the environment:

   ```bash
   export DISCORD_CLIENT_ID=<numeric application id>
   export DISCORD_CLIENT_SECRET=<client secret>
   ```

   (analogously `GOOGLE_*` and `MICROSOFT_*`; see [Configuration](/self-hosting/configuration)).

A provider only appears on the login page when both its id and secret are set. The
list of configured providers is also exposed unauthenticated at
`GET /api/v1/auth/providers`.

## Important

`BASE_URL` must be exactly the public URL of the backend as users reach it,
including the protocol and port if non-standard. Otherwise the provider rejects
the redirect after login.
