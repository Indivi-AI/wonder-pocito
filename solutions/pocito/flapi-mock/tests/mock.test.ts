import assert from 'node:assert/strict';
import test from 'node:test';
import { server } from '../server';

process.env.FLAPI_TOKEN = 'correct-token';

test('requires the configured token and hardcoded username', async () => {
  for (const headers of [{}, {Authorization: 'wrong', Username: '625navehp'},
    {Authorization: 'correct-token', Username: 'wrong'}])
    assert.equal((await server.inject({method: 'GET', url: '/package/v1/search/sales', headers})).statusCode, 401);
  assert.equal((await server.inject({method: 'GET', url: '/package/v1/search/sales',
    headers: {Authorization: 'correct-token', Username: '625navehp'}})).statusCode, 200);
  assert.equal((await server.inject({method: 'POST', url: '/package/v2/7', payload: {},
    headers: {Authorization: 'correct-token', Username: '625navehp'}})).statusCode, 200);
});
