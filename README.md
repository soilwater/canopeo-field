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

## Updates and releasing a new version

The app never updates itself. A user gets a new version only by opening **About → Check for updates** and accepting; choosing "Not now" keeps the installed version, and they can check again at any time.

To release a new version, change `APP_VERSION` in `index.html` and publish. Nothing else needs a version bump:

- `APP_TC_VERSION` is the version of the Terms & Conditions. Changing it makes every user accept the terms again, so change it only when the terms change.
- `sw.js` only needs editing when the service worker's own logic or its list of files changes. Replacing it does not replace an installed copy of the app.
