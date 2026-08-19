const authentication = require('./authentication');
const { addAuth } = require('./common');

const propertySignalChanged = require('./triggers/property-signal-changed');
const watchlistAlert = require('./triggers/watchlist-alert');
const reportReady = require('./triggers/report-ready');
const intelligenceFindingCreated = require('./triggers/intelligence-finding-created');
const findProperty = require('./searches/find-property');
const getPropertySnapshot = require('./searches/get-property-snapshot');
const addToWatchlist = require('./creates/add-to-watchlist');
const removeFromWatchlist = require('./creates/remove-from-watchlist');
const runIntelligenceAnalysis = require('./creates/run-intelligence-analysis');
const attachCrmContext = require('./creates/attach-crm-context');

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,
  authentication,
  beforeRequest: [addAuth],
  triggers: {
    [propertySignalChanged.key]: propertySignalChanged,
    [watchlistAlert.key]: watchlistAlert,
    [reportReady.key]: reportReady,
    [intelligenceFindingCreated.key]: intelligenceFindingCreated,
  },
  searches: {
    [findProperty.key]: findProperty,
    [getPropertySnapshot.key]: getPropertySnapshot,
  },
  creates: {
    [addToWatchlist.key]: addToWatchlist,
    [removeFromWatchlist.key]: removeFromWatchlist,
    [runIntelligenceAnalysis.key]: runIntelligenceAnalysis,
    [attachCrmContext.key]: attachCrmContext,
  },
};
