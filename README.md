# paste

Private-by-default Pastebin for `paste.zhijic.com`, built on Cloudflare Workers + KV.

## Features

- Unlisted, cryptographically random paste URLs
- Expiration: 1 hour, 1 day, 7 days, 30 days, or no automatic expiry
- Raw text view and lightweight client-side syntax highlighting
- Write protection through a secret bearer token
- No public paste index, no third-party scripts, and `noindex` headers
- 200 KiB limit per paste, designed for Cloudflare's free tier

## Cloudflare setup

1. Create a KV namespace, for example `paste-data`.
2. Bind it to the Worker with the variable name **`PASTES`**.
3. Set a Worker secret named **`WRITE_TOKEN`** to a long random value (32 random bytes is a good default):

   ```powershell
   $bytes = New-Object byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   [Convert]::ToBase64String($bytes)
   ```

4. Deploy the Worker and attach the custom domain `paste.zhijic.com`.

If deploying with Wrangler, install dependencies and run:

```sh
npm install
npx wrangler kv namespace create paste-data
npx wrangler secret put WRITE_TOKEN
npm run deploy
```

Add the returned KV namespace binding to `wrangler.jsonc`, or configure the `PASTES` binding in the Cloudflare dashboard.

## Development and tests

```sh
npm test
npm run dev
```

Create requests use `Authorization: Bearer <WRITE_TOKEN>`. The web UI keeps the token in the current browser tab's `sessionStorage`; it is never embedded in a paste URL.
