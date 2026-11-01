# Credits and licences

Independent Alcatraz exterior prototype. Source footprint extracts are included in `source-data/`.

## Data used in the build

- **Terrain:** USGS 3DEP, project CA_SanFrancisco_B23, collected 2023. Horizontal EPSG:7131, vertical NAVD88. Not for navigation, engineering or safety use. https://www.fisheries.noaa.gov/inport/item/73506
- **Maximum surface:** USGS Maximum_Surface_Height_Raster, same project. Source metadata: https://www.fisheries.noaa.gov/inport/item/73386/full-list .
- **Building footprints:** Microsoft US Building Footprints, served by Esri (MSBFP2). Open Data Commons Open Database License (ODbL) 1.0. https://github.com/microsoft/USBuildingFootprints and https://opendatacommons.org/licenses/odbl/1-0/
- **Warden's House mapped position:** OpenStreetMap contributors, via https://mapcarta.com/W27996789 . ODbL 1.0. https://www.openstreetmap.org/copyright
- **Lighthouse position:** USCG Local Notice to Mariners. https://www.navcen.uscg.gov/sites/default/files/pdf/lnms/lnm11452024.pdf
- **Lighthouse dimensions:** 1910 inventory via US Lighthouse Society. https://uslhs.org/gr/inventory/light_station_report.php?id=7

The original 11-feature footprint extract and its EPSG:7131 transformation are available in `source-data/`. The transformed runtime footprint and surface-statistics database is `data/footprints.json`; the runtime geometry method is included in `src/world.js` and `src/geom.js`. The original and adapted Microsoft-derived footprint databases are offered under ODbL 1.0; see `source-data/LICENSE-ODbL.txt` and `data/LICENSE-ODbL.txt`. Terrain data and other independent sources retain their respective status.

## Visual references only

No photographs ship in this build. All surfaces are procedural. These were used to interpret form:

- Library of Congress, Historic American Buildings Survey CA-1792 (Jet Lowe, 1986). https://www.loc.gov/item/ca1498/
- Wikimedia Commons, aerial by druchoy, 2005, CC BY-SA 2.0. https://commons.wikimedia.org/wiki/File:Alcatraz_aerial.jpg
- National Park Service site map and page images.
- HMDB 1954 lighthouse and Warden's House image, research reference only. https://www.hmdb.org/PhotoFullSize.asp?PhotoID=865605
- FBI Alcatraz escape investigation photographs. https://www.fbi.gov/history/cases-and-criminals/alcatraz-escape
- Cory Doctorow, hospital corridor, 2012, CC BY-SA 2.0.
- William Warby, hospital ward, 2013, CC BY 2.0.

No reference photographs or screenshots are included in this release.

## Code

All game code here was written for this project. It has no third-party libraries.
