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

  const [newVersion] = await client.addSecretVersion({
    parent,
    payload: { data: Buffer.from(value, 'utf8') },
  });

  // Destroy all old versions to avoid accumulating billable versions
  try {
    const [versions] = await client.listSecretVersions({ parent });
    for (const v of versions) {
      if (v.name !== newVersion.name && v.state === 'ENABLED') {
        await client.destroySecretVersion({
          name: v.name,
          etag: v.etag,
        });
      }
    }
  } catch (err) {
    // Log but don't fail the update if cleanup fails
    console.error('Failed to clean up old secret versions for', secretId, err.message);
  }
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
