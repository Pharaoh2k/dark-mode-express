# Dark Mode Express

A faster fork of [Dark Reader](https://github.com/darkreader/darkreader) for Firefox. It looks and works like Dark Reader, with fixes for flashes and slow page loads that haven't landed upstream.

Dark Mode Express is based on Dark Reader by Alexander Shutau and its contributors, under the MIT license. It is not affiliated with or endorsed by Dark Reader Ltd. If you like it, please [support the original project](https://darkreader.org/support-us/).

## What's different

- **No unstyled flash when Dark Reader checks for a site's own dark theme.** Dark Reader's detector reads the page layout before the page's stylesheets have loaded, which makes Firefox paint the page without its CSS, and it judges that unstyled page. Dark Mode Express checks the markup first and only looks at the page once its stylesheets are in.
- **Decides before it builds.** On a site with its own dark theme, Dark Reader builds a full theme on every load and then throws it away. Dark Mode Express decides first, and remembers each site's verdict, so a dark site you've visited before is left completely alone.
- **No gray flash on sites you excluded, or when it's switched off.** Dark Reader adds its gray placeholder style to every new tab, even on sites in your list. Dark Mode Express skips those sites before any script runs.
- **Faster on sites with many CSS variables.** Rules with hundreds of variables are rebuilt once instead of once per variable (on GitHub, about 1 million re-parsed declarations fewer per load).
- **GitHub detection that follows GitHub's own theme setting**, including "Sync with system".

Measured in Firefox on github.com in new tabs: Dark Reader 4.9.135 forced an early layout in 19 of 20 loads and painted before its CSS in 11 of 20. Dark Mode Express did neither, with no measurable change in load time.

## Install

1. Download the latest `.xpi` from [Releases](https://github.com/Pharaoh2k/dark-mode-express/releases/latest) and open it in Firefox. It is signed by Mozilla for self-distribution.
2. Disable Dark Reader (Add-ons and themes, Extensions). Two dark mode extensions at once fight each other.
3. To bring your settings along: in Dark Reader, open Settings, Manage settings, and export them. Import that file in Dark Mode Express the same way.

Installed copies update automatically from this repository.

## Privacy

Dark Mode Express collects nothing and has no analytics.

- Your settings are kept in browser storage and, like in Dark Reader, synced through Firefox Sync unless you turn settings sync off.
- To skip work on sites with their own dark theme, it remembers which sites were dark or light (host names only, at most 500, kept on this device and never synced).
- To theme a page, it may download that page's stylesheets, like Dark Reader does.
- "Synchronize site fixes" (off by default) downloads Dark Reader's site fixes from GitHub. News is off by default; turning it on fetches Dark Reader's blog.

## Building

```
npm ci
npm run build:firefox
```

The extension is built to `build/release/firefox` (load `manifest.json` from there in `about:debugging` to test it).

## Releasing

Push a tag `v<version>` that matches the version in `src/manifest.json` (for example `v4.9.135.1`). The release workflow builds the extension, has Mozilla sign it as an unlisted add-on, publishes it as a GitHub release, and adds it to `updates.json` so installed copies update.

It needs two repository secrets from [AMO API keys](https://addons.mozilla.org/developers/addon/api/key/): `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`.

## License

MIT, see [LICENSE](LICENSE). Dark Reader is copyright Dark Reader Ltd.
