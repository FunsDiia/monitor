# Kharkiv Sentinel - Scraper Setup

This guide explains how to set up the automated threat parser using GitHub Actions.

## 1. Prerequisites
- A GitHub account for your repository.
- Telegram API ID and Hash (get them from https://my.telegram.org/).

## 2. GitHub Secrets
In your GitHub repository, go to **Settings > Secrets and variables > Actions** and add:
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `GH_TOKEN` (Create a personal access token with repo permissions).

## 3. GitHub Action Setup
Create a file `.github/workflows/scraper.yml` in your repo:

```yaml
name: Run Scraper
on:
  schedule:
    - cron: '*/5 * * * *' # Run every 5 minutes
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.x'
      - name: Install dependencies
        run: pip install -r requirements_scraper.txt
      - name: Run scraper
        env:
          TELEGRAM_API_ID: ${{ secrets.TELEGRAM_API_ID }}
          TELEGRAM_API_HASH: ${{ secrets.TELEGRAM_API_HASH }}
        run: python scraper.py
      - name: Push results
        run: |
          git config --global user.name 'github-actions'
          git config --global user.email 'github-actions@github.com'
          git add threats.json
          git commit -m 'Update threats'
          git push
        env:
          GITHUB_TOKEN: ${{ secrets.GH_TOKEN }}
```

## 4. Finalizing
- Update `THREATS_JSON_URL` in `src/App.tsx` of your frontend app to match your new repository's raw URL:
  `https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/threats.json`
