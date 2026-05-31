// GitHub Actions secret ekleme (libsodium sealed box ile encrypt).
// Kullanim: node scripts/set-secret.js OWNER REPO SECRET_NAME SECRET_VALUE GITHUB_PAT
import sodium from 'libsodium-wrappers';

const [,, owner, repo, name, value, pat] = process.argv;
if (!owner || !repo || !name || !value || !pat) {
  console.error('Kullanim: node scripts/set-secret.js OWNER REPO SECRET_NAME SECRET_VALUE GITHUB_PAT');
  process.exit(1);
}

await sodium.ready;

// 1) Public key cek
const pkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/secrets/public-key`, {
  headers: { Authorization: `token ${pat}`, Accept: 'application/vnd.github+json' }
});
if (!pkRes.ok) {
  console.error(`Public key cekilemedi: ${pkRes.status} ${await pkRes.text()}`);
  process.exit(1);
}
const { key, key_id } = await pkRes.json();

// 2) Encrypt
const messageBytes = sodium.from_string(value);
const keyBytes = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
const encryptedValue = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

// 3) PUT secret
const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/secrets/${name}`, {
  method: 'PUT',
  headers: {
    Authorization: `token ${pat}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ encrypted_value: encryptedValue, key_id })
});
if (!putRes.ok) {
  console.error(`Secret kaydedilemedi: ${putRes.status} ${await putRes.text()}`);
  process.exit(1);
}
console.log(`✓ ${name} kaydedildi (${owner}/${repo})`);
