const authentication = require('./authentication');
const propertySignalChanged = require('./triggers/property_signal_changed');
const getGovernedPropertySnapshot = require('./creates/get_governed_property_snapshot');

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,
  authentication,
  triggers: {
    [propertySignalChanged.key]: propertySignalChanged,
  },
  creates: {
    [getGovernedPropertySnapshot.key]: getGovernedPropertySnapshot,
  },
};
