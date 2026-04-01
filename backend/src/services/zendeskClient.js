const axios = require('axios');
const config = require('../config');

function zendeskApi() {
  const base = `https://${config.zendeskSubdomain}.zendesk.com/api/v2`;
  const auth = {
    username: `${config.zendeskEmail}/token`,
    password: config.zendeskApiToken,
  };
  return { base, auth };
}

async function getTicket(ticketId) {
  const { base, auth } = zendeskApi();
  const response = await axios.get(`${base}/tickets/${ticketId}.json`, { auth });
  const ticket = response.data.ticket;

  const storeFieldId = Number(config.zendeskStoreFieldId);
  const storeField = (ticket.custom_fields || []).find(f => f.id === storeFieldId);

  return {
    ticketId: ticket.id,
    requesterId: ticket.requester_id,
    storeName: storeField ? storeField.value : null,
  };
}

async function getUserEmails(userId) {
  const { base, auth } = zendeskApi();
  const response = await axios.get(`${base}/users/${userId}/identities.json`, { auth });
  const identities = response.data.identities || [];
  return identities
    .filter(i => i.type === 'email')
    .map(i => i.value);
}

async function updateTicketFields(ticketId, customFields) {
  const { base, auth } = zendeskApi();
  await axios.put(
    `${base}/tickets/${ticketId}.json`,
    { ticket: { custom_fields: customFields } },
    { auth }
  );
}

async function getUser(userId) {
  const { base, auth } = zendeskApi();
  const response = await axios.get(`${base}/users/${userId}.json`, { auth });
  const user = response.data.user;
  return {
    name: user.name,
    email: user.email,
  };
}

async function updateUser(userId, { name }) {
  const { base, auth } = zendeskApi();
  await axios.put(
    `${base}/users/${userId}.json`,
    { user: { name } },
    { auth }
  );
}

module.exports = { getTicket, getUserEmails, updateTicketFields, getUser, updateUser };
