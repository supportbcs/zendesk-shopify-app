const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const config = require('../config');

const client = new SecretManagerServiceClient();

async function getSecret(secretName) {
  const [version] = await client.accessSecretVersion({ name: secretName });
  return version.payload.data.toString('utf8');
}

async function createSecret(secretId, value) {
  const parent = 'projects/' + config.gcpProjectId;

  // Create the secret
  await client.createSecret({
    parent,
    secretId,
    secret: { replication: { automatic: {} } },
  });

  // Add the first version with the actual value
  await client.addSecretVersion({
    parent: parent + '/secrets/' + secretId,
    payload: { data: Buffer.from(value, 'utf8') },
  });

  return parent + '/secrets/' + secretId + '/versions/latest';
}

async function updateSecret(secretId, value) {
  const parent = 'projects/' + config.gcpProjectId + '/secrets/' + secretId;

  await client.addSecretVersion({
    parent,
    payload: { data: Buffer.from(value, 'utf8') },
  });
}

async function deleteSecret(secretId) {
  const name = 'projects/' + config.gcpProjectId + '/secrets/' + secretId;

  try {
    await client.deleteSecret({ name });
  } catch (err) {
    // Ignore NOT_FOUND — secret may have been deleted already
    if (err.code !== 5) throw err;
  }
}

module.exports = { getSecret, createSecret, updateSecret, deleteSecret };
