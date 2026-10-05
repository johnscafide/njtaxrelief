const { api } = require('../common');
module.exports = {
  key: 'attach_crm_context',
  noun: 'CRM Context',
  display: { label: 'Send CRM Context to Watchdog', description: 'Adds user-authorized CRM relationship context to Watchdog without replacing governed property facts.' },
  operation: {
    inputFields: [
      { key: 'external_contact_id', label: 'CRM Contact ID', type: 'string', required: true },
      { key: 'pams_pin', label: 'Watchdog PAMS PIN', type: 'string', required: false },
      { key: 'property_address', label: 'CRM Property Address', type: 'string', required: false },
      { key: 'contact_name', label: 'Contact Name', type: 'string', required: false },
      { key: 'contact_email', label: 'Contact Email', type: 'string', required: false },
      { key: 'contact_phone', label: 'Contact Phone', type: 'string', required: false },
      { key: 'lead_stage', label: 'Lead Stage', type: 'string', required: false },
      { key: 'relationship', label: 'Relationship', type: 'string', required: false },
      { key: 'last_activity_at', label: 'Last CRM Activity', type: 'datetime', required: false },
      { key: 'tags', label: 'Tags', list: true, required: false },
    ],
    perform: async (z, bundle) => {
      const result = await api(z, bundle, 'crm.context.attach', bundle.inputData);
      return result.context;
    },
    sample: { id: '00000000-0000-0000-0000-000000000004', external_contact_id: 'crm-123', property_ref: 'sample-pin', updated_at: '2026-08-19T15:45:00Z' },
  },
};
