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
`npm run build:js`, and `bundle exec jekyll build`. The committed lockfiles and
CI checks cover Jekyll 4.4 and the actual root site.

The current legacy GitHub Pages builder uses a different dependency graph.
Before releasing this migration, switch Pages to GitHub Actions and complete
the site's release review. The manual Pages workflow builds the locked source
and uploads the generated site. A successful local build does not verify the
published site or its visual behavior.
