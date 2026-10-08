const fs = require('node:fs');
const path = require('node:path');

const toModuleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

// Browser ESM stays .js without changing this repository's CommonJS package type.
module.exports = async function loadArcadeModules() {
  const assets = path.join(__dirname, '..', 'assets');
  const navigationUrl = toModuleUrl(fs.readFileSync(path.join(assets, 'arcade-navigation.js'), 'utf8'));
  const catalogSource = fs.readFileSync(path.join(assets, 'arcade-catalog.js'), 'utf8')
    .replace(/(['"])\.\/arcade-navigation\.js\1/g, JSON.stringify(navigationUrl));
  const [navigation, catalog] = await Promise.all([
    import(navigationUrl),
    import(toModuleUrl(catalogSource)),
  ]);
  return { navigation, catalog };
};
