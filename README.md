# ESBE Tech - Website

This repository contains the source code for the ESBE Tech website, a Jekyll-based site hosted on GitHub Pages.

The website provides information about the computer repair and consulting services offered by ESBE Tech.

## Purpose

This site aims to offer a clear overview of services, pricing, and contact information for ESBE Tech, inspired by the content and structure of [esbe.tech](https://www.esbe.tech/).

## Built With

*   Jekyll
*   Minimal Mistakes Theme (modified)

## Build and release

Use Ruby 3.3 or newer and Node 22.22 or newer. Run `bundle install`, `npm ci`,
`npx --no-install playwright install chromium`, and `npm run build`. This runs
lint, JavaScript/watcher checks, validator failure controls, the root Jekyll build,
release metadata/CSP validation, and rendered readability/reflow checks. Browser
measurements and screenshots are saved under `.artifacts/readability`.
The committed lockfiles and
CI checks cover Jekyll 4.4 and the actual root site.

For the legacy Pages migration, switch the repository's Pages source to GitHub
Actions after the release review, merge the reviewed branch, and dispatch
`Publish GitHub Pages` on `master`. That workflow runs the gates on the locked
source before uploading its artifact. Verify the Pages run and served page after
publication; a local build alone does not establish live behavior.

## Latest Changes

- Pin Biome and enforce project-local lint in CI, builds, and manual releases.
- Validate every rendered HTML page and prove missing assets/metadata fail.
- Add local social previews, public metadata, and a static-host CSP baseline.
- Check root-page contrast and reflow across viewport, text-scale, and OS themes.

Biome checks all parseable first-party JS/MJS/JSON. Third-party FitVids,
Magnific Popup, jQuery, Lunr, minified bundles, and lockfiles are excluded.
The adapted greedy-navigation plugin stays checked. Biome cannot parse Jekyll
Liquid/frontmatter JavaScript or Sass: Jekyll compiles these during site builds;
rendered browser checks and bundle syntax checks cover their resulting output.
No lint rules are disabled to accommodate findings.

The CSP uses a meta element because GitHub Pages does not offer custom response
headers. It allows existing inline theme scripts/styles and Font Awesome's
script host; it restricts objects, base URLs, and form targets. Header-only CSP
directives cannot be enforced by a meta policy.
