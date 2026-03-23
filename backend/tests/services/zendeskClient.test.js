jest.mock('axios');
jest.mock('../../src/config', () => ({
  zendeskSubdomain: 'testcompany',
  zendeskEmail: 'agent@test.com',
  zendeskApiToken: 'zdtoken123',
  zendeskStoreFieldId: '9999',
}));

const axios = require('axios');
const {
  getTicket,
  getUserEmails,
  updateTicketFields,
} = require('../../src/services/zendeskClient');

describe('zendeskClient', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getTicket', () => {
    test('returns store name and requester ID', async () => {
      axios.get.mockResolvedValue({
        data: {
          ticket: {
            id: 98765,
            requester_id: 11111,
            custom_fields: [
              { id: 9999, value: 'SolitSocks' },
              { id: 1234, value: 'other' },
            ],
          },
        },
      });

      const result = await getTicket('98765');

      expect(result).toEqual({
        ticketId: 98765,
        requesterId: 11111,
        storeName: 'SolitSocks',
      });
    });

    test('returns null storeName when field not found', async () => {
      axios.get.mockResolvedValue({
        data: {
          ticket: {
            id: 98765,
            requester_id: 11111,
            custom_fields: [{ id: 1234, value: 'other' }],
          },
        },
      });

      const result = await getTicket('98765');
      expect(result.storeName).toBeNull();
    });
  });

  describe('getUserEmails', () => {
    test('returns all verified emails', async () => {
      axios.get.mockResolvedValue({
        data: {
          user: {
            id: 11111,
            email: 'john@example.com',
          },
          identities: [
            { type: 'email', value: 'john@example.com', verified: true },
            { type: 'email', value: 'john.doe@work.com', verified: true },
          ],
        },
      });

      const emails = await getUserEmails(11111);
      expect(emails).toEqual(['john@example.com', 'john.doe@work.com']);
    });
  });

  describe('updateTicketFields', () => {
    test('sends correct payload to Zendesk API', async () => {
      axios.put.mockResolvedValue({ data: {} });

      const fields = [
        { id: '12345', value: '#1052' },
        { id: '12346', value: 'paid' },
      ];

      await updateTicketFields('98765', fields);

      expect(axios.put).toHaveBeenCalledWith(
        'https://testcompany.zendesk.com/api/v2/tickets/98765.json',
        { ticket: { custom_fields: fields } },
        expect.any(Object)
      );
    });
  });
});
