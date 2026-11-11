# canopeo-field
A portable version of Canopeo for field use

## Downloading your data

All cards are stored locally on the device (IndexedDB), so no server connection is needed to get your data out. In the gallery, tap **Download** and choose one of:

- **All Images + Data (.zip)** — a single ZIP file with everything on the device
- **CSV** — card data as a table
- **JSON** — card data as JSON
- **PDF Report** — a report of selected cards

The ZIP file (added in v2.6.0) replaces the previous image-by-image download and contains:

```
canopeo-field_export_<timestamp>/
├── images/   canopeo-field_<card_id>_original.jpg
├── masks/    canopeo-field_<card_id>_classified.png
├── data.csv
└── data.json
```

Cards captured with earlier versions of the app are included automatically after updating. The ZIP is built on the device and works offline, using [JSZip](https://stuk.github.io/jszip/) and [FileSaver.js](https://github.com/eligrey/FileSaver.js) (both self-hosted in `libs/`).

## Releasing a new version

Change `APP_VERSION` in `index.html` and publish. Installed copies pick it up the next time the app is opened or brought back to the foreground while online. **About → Check for updates** forces the check.

Also bump `CACHE_VERSION` in `sw.js` when a file under `libs/` changes. `APP_TC_VERSION` is the version of the Terms & Conditions; changing it makes every user accept the terms again.
